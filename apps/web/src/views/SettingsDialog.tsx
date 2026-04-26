import { useEffect, useState } from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs.js';
import {
  fetchConfig,
  saveConfigPatch,
  type ConfigPatch,
  type MaskedLoreweaveConfig,
} from '../lib/lw.js';
import { cn } from '../lib/utils.js';
import { useSkin } from '../theme/SkinProvider.js';

interface Props {
  onClose: () => void;
}

/**
 * User-level AI settings dialog. Reads and writes `~/.loreweave/config.json`
 * via the sidecar's `/lw/config` endpoint. API keys are never echoed back
 * from the server — we show `••••••••` for saved keys and let the writer
 * replace them explicitly.
 *
 * Environment variables that are already set override this config; the
 * dialog shows which ones are active so the writer understands why a saved
 * value might not be taking effect.
 */
export function SettingsDialog({ onClose }: Props) {
  const [cfg, setCfg] = useState<MaskedLoreweaveConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Chat fields
  const [chatProvider, setChatProvider] = useState<string>('');
  const [chatModel, setChatModel] = useState<string>('');
  const [anthropicKey, setAnthropicKey] = useState<string>('');
  const [openaiKey, setOpenaiKey] = useState<string>('');
  const [ollamaHost, setOllamaHost] = useState<string>('');

  // Embeddings fields
  const [embProvider, setEmbProvider] = useState<string>('');
  const [embModel, setEmbModel] = useState<string>('');
  const [embEndpoint, setEmbEndpoint] = useState<string>('');
  const [embKey, setEmbKey] = useState<string>('');

  useEffect(() => {
    fetchConfig()
      .then((c) => {
        setCfg(c);
        setChatProvider(c.chat.provider ?? '');
        setChatModel(c.chat.model ?? '');
        setOllamaHost(c.chat.ollamaHost ?? '');
        setEmbProvider(c.embeddings.provider ?? '');
        setEmbModel(c.embeddings.model ?? '');
        setEmbEndpoint(c.embeddings.endpoint ?? '');
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  const save = async () => {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const patch: ConfigPatch = {
        chat: {
          provider:
            chatProvider === ''
              ? null
              : (chatProvider as 'anthropic' | 'openai' | 'ollama'),
          model: chatModel === '' ? null : chatModel,
          ollamaHost: ollamaHost === '' ? undefined : ollamaHost,
        },
        embeddings: {
          provider:
            embProvider === ''
              ? null
              : (embProvider as 'ollama' | 'openai-compatible'),
          model: embModel === '' ? null : embModel,
          endpoint: embEndpoint === '' ? null : embEndpoint,
        },
      };
      // Only send API keys if the writer typed a new one — empty string
      // means "no change"; explicit "-" means "clear".
      if (anthropicKey === '-') patch.chat!.anthropicApiKey = null;
      else if (anthropicKey) patch.chat!.anthropicApiKey = anthropicKey;
      if (openaiKey === '-') patch.chat!.openaiApiKey = null;
      else if (openaiKey) patch.chat!.openaiApiKey = openaiKey;
      if (embKey === '-') patch.embeddings!.apiKey = null;
      else if (embKey) patch.embeddings!.apiKey = embKey;

      const updated = await saveConfigPatch(patch);
      setCfg(updated);
      setAnthropicKey('');
      setOpenaiKey('');
      setEmbKey('');
      setInfo('Saved.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-border bg-background shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <Tabs defaultValue="ai" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-5 mt-3 w-fit">
            <TabsTrigger value="ai">AI</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
          </TabsList>

          <TabsContent
            value="ai"
            className="flex-1 overflow-y-auto px-5 py-4 space-y-6 mt-3"
          >
            {err && (
              <div className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {err}
              </div>
            )}
            {info && (
              <div className="rounded border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {info}
              </div>
            )}

          {cfg && cfg.envOverrides.length > 0 && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Environment variables are overriding saved settings:{' '}
              <code className="font-mono">{cfg.envOverrides.join(', ')}</code>.
              Unset them to use the values saved here.
            </div>
          )}

          <section>
            <h3 className="text-sm font-semibold mb-2">Chat agents</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Provider and model used by <code>@muse</code>, <code>@scribe</code>,{' '}
              <code>@warden</code>, <code>@polisher</code>, and{' '}
              <code>@archivist</code>.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <div className="mb-1 text-xs text-muted-foreground">Provider</div>
                <select
                  className="w-full rounded border border-border bg-background px-2 py-1"
                  value={chatProvider}
                  onChange={(e) => setChatProvider(e.target.value)}
                >
                  <option value="">(none)</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="ollama">Ollama (local)</option>
                </select>
              </label>
              <label className="text-sm">
                <div className="mb-1 text-xs text-muted-foreground">Model</div>
                <input
                  className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                  placeholder={
                    chatProvider === 'anthropic'
                      ? 'claude-3-5-sonnet-latest'
                      : chatProvider === 'openai'
                        ? 'gpt-4o-mini'
                        : chatProvider === 'ollama'
                          ? 'llama3.1'
                          : ''
                  }
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-3 space-y-2">
              <KeyField
                label="Anthropic API key"
                saved={!!cfg?.chat.anthropicApiKey}
                value={anthropicKey}
                setValue={setAnthropicKey}
              />
              <KeyField
                label="OpenAI API key"
                saved={!!cfg?.chat.openaiApiKey}
                value={openaiKey}
                setValue={setOpenaiKey}
              />
              <label className="block text-sm">
                <div className="mb-1 text-xs text-muted-foreground">
                  Ollama host
                </div>
                <input
                  className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                  placeholder="http://127.0.0.1:11434"
                  value={ollamaHost}
                  onChange={(e) => setOllamaHost(e.target.value)}
                />
              </label>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">Embeddings (optional)</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Used by <code>semantic_search</code> and the{' '}
              <code>/lw/embed/build</code> endpoint. Off unless a provider is
              selected.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <div className="mb-1 text-xs text-muted-foreground">Provider</div>
                <select
                  className="w-full rounded border border-border bg-background px-2 py-1"
                  value={embProvider}
                  onChange={(e) => setEmbProvider(e.target.value)}
                >
                  <option value="">(disabled)</option>
                  <option value="ollama">Ollama (local)</option>
                  <option value="openai-compatible">OpenAI-compatible</option>
                </select>
              </label>
              <label className="text-sm">
                <div className="mb-1 text-xs text-muted-foreground">Model</div>
                <input
                  className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                  placeholder={
                    embProvider === 'ollama'
                      ? 'nomic-embed-text'
                      : embProvider === 'openai-compatible'
                        ? 'text-embedding-3-small'
                        : ''
                  }
                  value={embModel}
                  onChange={(e) => setEmbModel(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-3 space-y-2">
              <label className="block text-sm">
                <div className="mb-1 text-xs text-muted-foreground">Endpoint</div>
                <input
                  className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
                  placeholder={
                    embProvider === 'ollama'
                      ? 'http://127.0.0.1:11434'
                      : 'https://api.openai.com/v1'
                  }
                  value={embEndpoint}
                  onChange={(e) => setEmbEndpoint(e.target.value)}
                />
              </label>
              <KeyField
                label="API key (OpenAI-compatible only)"
                saved={!!cfg?.embeddings.apiKey}
                value={embKey}
                setValue={setEmbKey}
              />
            </div>
          </section>

          {cfg && (
            <p className="text-[11px] text-muted-foreground">
              Settings are stored in{' '}
              <code className="font-mono">{cfg.path}</code> with file mode{' '}
              <code>0600</code>. Keys are never committed to your Saga repo.
            </p>
          )}
          </TabsContent>

          <TabsContent
            value="appearance"
            className="flex-1 overflow-y-auto px-5 py-4 space-y-4 mt-3"
          >
            <SkinPicker />
            <p className="text-[11px] text-muted-foreground">
              Skins are CSS variable maps written to <code>:root</code>. Your
              choice is remembered locally in this browser.
            </p>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            className="rounded border border-border px-3 py-1 text-sm hover:bg-muted"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
            onClick={save}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Masked API key input. Shows `••••••••` placeholder when a key is saved,
 * empty when not. Typing anything replaces the saved key; typing a single
 * `-` clears it.
 */
function KeyField({
  label,
  saved,
  value,
  setValue,
}: {
  label: string;
  saved: boolean;
  value: string;
  setValue: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        {saved && (
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
            saved
          </span>
        )}
      </div>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
        placeholder={saved ? '••••••••  (type to replace, `-` to clear)' : 'sk-…'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </label>
  );
}


function SkinPicker() {
  const { skin, available, setSkinId } = useSkin();
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Skin</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Restyle the entire app. Skins write CSS variables to <code>:root</code>; nothing else changes.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {available.map((s) => {
          const active = s.id === skin.id;
          return (
            <button
              key={s.id}
              onClick={() => setSkinId(s.id)}
              className={cn(
                'flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
                active
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-muted',
              )}
            >
              <SkinSwatch tokens={s.tokens} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {s.description}
                </div>
              </div>
              {active && (
                <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                  active
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SkinSwatch({ tokens }: { tokens: { background: string; primary: string; accent: string; foreground: string } }) {
  return (
    <div className="flex h-8 w-12 shrink-0 overflow-hidden rounded border border-border">
      <div className="flex-1" style={{ background: `hsl(${tokens.background})` }} />
      <div className="flex-1" style={{ background: `hsl(${tokens.primary})` }} />
      <div className="flex-1" style={{ background: `hsl(${tokens.accent})` }} />
    </div>
  );
}