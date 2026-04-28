// Loreweave desktop entry point.
//
// Boots the bundled Node sidecar (Tauri sidecar binary `lw-node`) with the
// staged web/sidecar/cli resources, waits for the local HTTP server to
// come up, then navigates the main window at it.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

#[derive(Clone, Serialize)]
struct LauncherStatus {
    stage: &'static str,
    detail: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct RecentSaga {
    path: String,
    title: Option<String>,
    /// Unix-millis of last open. Newest first when listed.
    opened_at: i64,
}

const RECENTS_LIMIT: usize = 20;

fn user_data_root() -> PathBuf {
    if let Some(home) = dirs_home() {
        home.join(".loreweave")
    } else {
        PathBuf::from(".loreweave")
    }
}

fn dirs_home() -> Option<PathBuf> {
    // Avoid pulling the `dirs` crate just for this.
    if let Ok(p) = std::env::var("HOME") {
        return Some(PathBuf::from(p));
    }
    if let Ok(p) = std::env::var("USERPROFILE") {
        return Some(PathBuf::from(p));
    }
    None
}

fn recents_file() -> PathBuf {
    user_data_root().join("recents.json")
}

fn logs_dir() -> PathBuf {
    user_data_root().join("logs")
}

fn ensure_dir(p: &Path) {
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
}

fn read_recents() -> Vec<RecentSaga> {
    let path = recents_file();
    let Ok(text) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_recents(recents: &[RecentSaga]) -> Result<(), String> {
    let path = recents_file();
    ensure_dir(&path);
    let text = serde_json::to_string_pretty(recents).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_recent_sagas() -> Vec<RecentSaga> {
    read_recents()
}

#[tauri::command]
fn add_recent_saga(path: String, title: Option<String>) -> Result<Vec<RecentSaga>, String> {
    let mut list = read_recents();
    list.retain(|r| r.path != path);
    list.insert(
        0,
        RecentSaga {
            path,
            title,
            opened_at: chrono_now_millis(),
        },
    );
    if list.len() > RECENTS_LIMIT {
        list.truncate(RECENTS_LIMIT);
    }
    write_recents(&list)?;
    Ok(list)
}

#[tauri::command]
fn forget_recent_saga(path: String) -> Result<Vec<RecentSaga>, String> {
    let mut list = read_recents();
    list.retain(|r| r.path != path);
    write_recents(&list)?;
    Ok(list)
}

fn chrono_now_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn log_file_path() -> PathBuf {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Days since epoch -- coarse but good enough for daily rotation without
    // pulling chrono. UTC-aligned.
    let day = secs / 86_400;
    logs_dir().join(format!("desktop-{day}.log"))
}

fn append_log_line(line: &str) {
    let path = log_file_path();
    ensure_dir(&path);
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let ts = chrono_now_millis();
        let _ = writeln!(f, "[{ts}] {line}");
    }
}

#[tauri::command]
fn open_log_file() -> Result<String, String> {
    let path = log_file_path();
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<Option<String>, String> {
    // Returns the available version string, or None if up to date. The
    // bundle ships with `updater.active = false` until a real Ed25519
    // pubkey is dropped into tauri.conf.json -- until then this command
    // resolves to None and emits a clear log line.
    let updater = app
        .updater_builder()
        .build()
        .map_err(|e| {
            append_log_line(&format!("updater not available: {e}"));
            e.to_string()
        })?;
    match updater.check().await {
        Ok(Some(update)) => Ok(Some(update.version.clone())),
        Ok(None) => Ok(None),
        Err(e) => {
            append_log_line(&format!("updater check failed: {e}"));
            Err(e.to_string())
        }
    }
}

fn pick_free_port() -> u16 {
    // Bind ephemeral, take the OS-assigned port, then drop the socket so
    // the embedded Node server can take it. Race window is small and only
    // matters at startup.
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(4729)
}

fn resources_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve("resources", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("resolve resources/: {e}"))
}

fn spawn_sidecar(
    app: &tauri::AppHandle,
    port: u16,
    root: &PathBuf,
) -> Result<CommandChild, String> {
    let launcher = root.join("scripts").join("launch.mjs");
    if !launcher.exists() {
        return Err(format!("missing launcher at {}", launcher.display()));
    }

    let cmd = app
        .shell()
        .sidecar("lw-node")
        .map_err(|e| format!("sidecar lw-node: {e}"))?
        .args([
            launcher.to_string_lossy().to_string(),
            "--root".into(),
            root.to_string_lossy().to_string(),
            "--port".into(),
            port.to_string(),
            "--no-open".into(),
        ]);

    let (mut rx, child) = cmd.spawn().map_err(|e| format!("spawn: {e}"))?;
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line).to_string();
                    eprintln!("[lw-node] {text}");
                    append_log_line(&format!("[lw-node] {text}"));
                    let _ = app_handle.emit("lw://log", text);
                }
                CommandEvent::Terminated(status) => {
                    let code = status.code.unwrap_or(-1);
                    eprintln!("[lw-node] exited: {code:?}");
                    append_log_line(&format!("[lw-node] terminated code={code}"));
                    let _ = app_handle.emit("lw://terminated", code);
                }
                _ => {}
            }
        }
    });

    Ok(child)
}

async fn wait_for_port(port: u16, deadline: Duration) -> bool {
    let url = format!("http://127.0.0.1:{port}/");
    let start = Instant::now();
    while start.elapsed() < deadline {
        if let Ok(resp) = reqwest_get(&url).await {
            if resp {
                return true;
            }
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
    false
}

// Tiny GET via std TCP -- avoids pulling reqwest just to ping a port.
async fn reqwest_get(url: &str) -> Result<bool, ()> {
    let url = url.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let parsed = url
            .strip_prefix("http://")
            .and_then(|rest| rest.split_once('/'))
            .map(|(host, _)| host.to_string())
            .unwrap_or_default();
        std::net::TcpStream::connect_timeout(
            &parsed.parse().map_err(|_| ())?,
            Duration::from_millis(250),
        )
        .map(|_| true)
        .map_err(|_| ())
    })
    .await
    .map_err(|_| ())?
}

fn focus_main(window: Option<&tauri::WebviewWindow>) {
    if let Some(w) = window {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

// TODO: Tray icon + menu (Show / Quick capture / Check for updates / Quit).
// Deferred until the Tauri 2 menu/tray API is locked down for the version
// pinned in Cargo.toml -- wiring it blind from a CI-only build is too
// risky. The Rust commands below already provide the underlying
// behaviour; the tray is a UX shortcut on top.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            list_recent_sagas,
            add_recent_saga,
            forget_recent_saga,
            check_for_updates,
            open_log_file,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let main_window = app
                .get_webview_window("main")
                .ok_or("main window missing")?;
            focus_main(Some(&main_window));

            tauri::async_runtime::spawn(async move {
                let _ = app_handle.emit(
                    "lw://status",
                    LauncherStatus {
                        stage: "starting",
                        detail: None,
                    },
                );

                let root = match resources_root(&app_handle) {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = app_handle.emit(
                            "lw://status",
                            LauncherStatus {
                                stage: "error",
                                detail: Some(e),
                            },
                        );
                        return;
                    }
                };

                let port = pick_free_port();
                match spawn_sidecar(&app_handle, port, &root) {
                    Ok(child) => {
                        // Stash the child so we can kill it on shutdown.
                        app_handle.manage(SidecarHandle(Mutex::new(Some(child))));
                    }
                    Err(e) => {
                        let _ = app_handle.emit(
                            "lw://status",
                            LauncherStatus {
                                stage: "error",
                                detail: Some(e),
                            },
                        );
                        return;
                    }
                }

                if !wait_for_port(port, Duration::from_secs(60)).await {
                    let _ = app_handle.emit(
                        "lw://status",
                        LauncherStatus {
                            stage: "error",
                            detail: Some("sidecar failed to come up".into()),
                        },
                    );
                    return;
                }

                let url = format!("http://127.0.0.1:{port}/");
                if let Err(e) = main_window.eval(&format!(
                    "window.location.replace('{}')",
                    url.replace('\'', "")
                )) {
                    eprintln!("navigate failed: {e}");
                }

                let _ = app_handle.emit(
                    "lw://status",
                    LauncherStatus {
                        stage: "ready",
                        detail: Some(url),
                    },
                );
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(handle) = window.app_handle().try_state::<SidecarHandle>() {
                    if let Ok(mut guard) = handle.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

struct SidecarHandle(Mutex<Option<CommandChild>>);
