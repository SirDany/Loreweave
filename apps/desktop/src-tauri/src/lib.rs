// Tauri entry point. Wires up commands that the webview can invoke.
//
// `lw_invoke` shells out to `node <repo>/packages/cli/dist/bin.js <args>` and
// returns stdout/stderr/exit-code as JSON. This is the "Node sidecar" approach
// described in the project plan — it keeps the heavy lifting in the TS core
// library while the Rust shell stays thin.
//
// `lw_write` writes a file inside a Saga directory. The path is verified to be
// contained within the given Saga root so the UI can't silently escape it.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

#[tauri::command]
fn ping() -> &'static str {
    "pong — Loreweave desktop shell is alive."
}

#[derive(Serialize)]
pub struct LwResult {
    stdout: String,
    stderr: String,
    code: i32,
}

/// Locate the repo root. Searches upward from cwd for `pnpm-workspace.yaml`.
fn locate_repo_root() -> Option<PathBuf> {
    let mut cur = std::env::current_dir().ok()?;
    for _ in 0..8 {
        if cur.join("pnpm-workspace.yaml").exists() {
            return Some(cur);
        }
        if !cur.pop() {
            break;
        }
    }
    None
}
fn locate_cli() -> Option<PathBuf> {
    let repo_root = locate_repo_root()?;
    let cli = repo_root.join("packages/cli/dist/bin.js");
    if cli.exists() {
        Some(cli)
    } else {
        None
    }
}

#[tauri::command]
fn lw_invoke(args: Vec<String>) -> Result<LwResult, String> {
    let repo_root = locate_repo_root().ok_or_else(|| {
        "could not locate repo root — run from within the Loreweave workspace".to_string()
    })?;
    let cli = locate_cli().ok_or_else(|| {
        "could not locate packages/cli/dist/bin.js — run `pnpm --filter @loreweave/cli build` first"
            .to_string()
    })?;
    let output = Command::new("node")
        .arg(cli)
        .args(&args)
        .current_dir(&repo_root)
        .output()
        .map_err(|e| format!("failed to spawn node: {e}"))?;
    Ok(LwResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        code: output.status.code().unwrap_or(-1),
    })
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ping, lw_invoke, lw_write])
        .run(tauri::generate_context!())
        .expect("error while running Loreweave");
}

/// Resolve `rel` against `saga_root`, then confirm the result stays inside it.
fn safe_join(saga_root: &Path, rel: &str) -> Result<PathBuf, String> {
    if rel.contains("..") {
        return Err("relative path must not contain '..'".into());
    }
    let root = std::fs::canonicalize(saga_root)
        .map_err(|e| format!("cannot canonicalize saga root: {e}"))?;
    let joined = root.join(rel);
    // Walk parents: joined itself might not exist yet.
    let mut base = joined.as_path();
    let canonical = loop {
        match std::fs::canonicalize(base) {
            Ok(p) => break Some(p),
            Err(_) => match base.parent() {
                Some(p) => base = p,
                None => break None,
            },
        }
    };
    let canonical = canonical.ok_or("cannot resolve parent directory".to_string())?;
    if !canonical.starts_with(&root) {
        return Err(format!(
            "path escape detected: {} is outside {}",
            canonical.display(),
            root.display()
        ));
    }
    Ok(joined)
}

#[tauri::command]
fn lw_write(saga_root: String, rel_path: String, content: String) -> Result<(), String> {
    let target = safe_join(Path::new(&saga_root), &rel_path)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir failed: {e}"))?;
    }
    std::fs::write(&target, content).map_err(|e| format!("write failed: {e}"))?;
    Ok(())
}
