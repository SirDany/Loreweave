import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ExternalLink,
  FolderSearch,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  dump,
  fetchConfig,
  fetchProviderModels,
  listSagas,
  saveConfigPatch,
  type ChatProviderId,
  type ConfigPatch,
  type DiscoveredSaga,
  type EmbeddingsProviderId,
  type MaskedLoreweaveConfig,
  type ModelDescriptor,
  type ModelsDiscoveryResponse,
} from '../lib/lw.js';
import { playModalClose, playModalOpen } from '../lib/sound.js';
import { cn } from '../lib/utils.js';

interface Props {
  currentSagaPath?: string;
  onPickSaga?: (path: string) => void;
  onClose: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type KeyFieldName =
  | 'anthropicApiKey'
  | 'openaiApiKey'
  | 'googleApiKey'
  | 'ollamaApiKey'
  | 'openrouterApiKey'
  | 'groqApiKey'
  | 'deepseekApiKey'
  | 'mistralApiKey'
  | 'xaiApiKey'
  | 'customApiKey';

interface ProviderUiMeta {
  label: string;
  keyField: KeyFieldName;
  keyLabel: string;
  keyPlaceholder: string;
  keyHelpUrl?: string;
  keyHelpLabel?: string;
  defaultModel: string;
}

const PROVIDER_UI: Record<ChatProviderId, ProviderUiMeta> = {
  google: {
    label: 'Google Gemini (AI Studio)',
    keyField: 'googleApiKey',
    keyLabel: 'Google AI Studio API Key',
    keyPlaceholder: 'AIza…',
    keyHelpUrl: 'https://aistudio.google.com/apikey',
    keyHelpLabel: 'Get key at Google AI Studio',
    defaultModel: 'gemini-2.5-flash',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    keyField: 'anthropicApiKey',
    keyLabel: 'Anthropic API Key',
    keyPlaceholder: 'sk-ant-…',
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
    keyHelpLabel: 'Anthropic Console',
    defaultModel: 'claude-sonnet-4-20250514',
  },
  openai: {
    label: 'OpenAI (GPT / o3 / o4)',
    keyField: 'openaiApiKey',
    keyLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-…',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    keyHelpLabel: 'OpenAI Platform',
    defaultModel: 'gpt-4o-mini',
  },
  openrouter: {
    label: 'OpenRouter (300+ Models / Free Tier)',
    keyField: 'openrouterApiKey',
    keyLabel: 'OpenRouter API Key',
    keyPlaceholder: 'sk-or-…',
    keyHelpUrl: 'https://openrouter.ai/keys',
    keyHelpLabel: 'OpenRouter Keys',
    defaultModel: 'google/gemini-2.5-flash',
  },
  groq: {
    label: 'Groq (Fast Inference)',
    keyField: 'groqApiKey',
    keyLabel: 'Groq API Key',
    keyPlaceholder: 'gsk_…',
    keyHelpUrl: 'https://console.groq.com/keys',
    keyHelpLabel: 'Groq Console',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  deepseek: {
    label: 'DeepSeek',
    keyField: 'deepseekApiKey',
    keyLabel: 'DeepSeek API Key',
    keyPlaceholder: 'sk-…',
    keyHelpUrl: 'https://platform.deepseek.com/api_keys',
    keyHelpLabel: 'DeepSeek Platform',
    defaultModel: 'deepseek-chat',
  },
  mistral: {
    label: 'Mistral AI',
    keyField: 'mistralApiKey',
    keyLabel: 'Mistral API Key',
    keyPlaceholder: 'Mistral API key…',
    keyHelpUrl: 'https://console.mistral.ai/api-keys',
    keyHelpLabel: 'Mistral Console',
    defaultModel: 'mistral-small-latest',
  },
  xai: {
    label: 'xAI (Grok)',
    keyField: 'xaiApiKey',
    keyLabel: 'xAI API Key',
    keyPlaceholder: 'xai-…',
    keyHelpUrl: 'https://console.x.ai',
    keyHelpLabel: 'xAI Console',
    defaultModel: 'grok-3-mini',
  },
  ollama: {
    label: 'Ollama (Local / Remote / Cloud)',
    keyField: 'ollamaApiKey',
    keyLabel: 'Ollama API Key / Bearer Token (optional)',
    keyPlaceholder: 'Optional token for remote Ollama or ollama.com',
    keyHelpUrl: 'https://ollama.com/settings/keys',
    keyHelpLabel: 'Ollama Cloud Keys',
    defaultModel: 'llama3.1',
  },
  'openai-compatible': {
    label: 'Custom OpenAI-Compatible (LM Studio / vLLM / llama.cpp)',
    keyField: 'customApiKey',
    keyLabel: 'API Key (optional)',
    keyPlaceholder: 'Optional bearer token',
    defaultModel: 'local-model',
  },
};

const ALL_KEY_FIELDS: KeyFieldName[] = [
  'anthropicApiKey',
  'openaiApiKey',
  'googleApiKey',
  'ollamaApiKey',
  'openrouterApiKey',
  'groqApiKey',
  'deepseekApiKey',
  'mistralApiKey',
  'xaiApiKey',
  'customApiKey',
];

const CLOUD_PROVIDERS: ChatProviderId[] = [
  'google',
  'anthropic',
  'openai',
  'openrouter',
  'groq',
  'deepseek',
  'mistral',
  'xai',
];

const LOCAL_PROVIDERS: ChatProviderId[] = ['ollama', 'openai-compatible'];

interface DraftState {
  chatProvider: ChatProviderId | '';
  chatModel: string;
  ollamaHost: string;
  customBaseUrl: string;
  keys: Partial<Record<KeyFieldName, string>>;
  embProvider: EmbeddingsProviderId | '';
  embModel: string;
  embEndpoint: string;
  embKey: string;
}

const DISCOVERY_ROOT_KEY = 'lw.sagaDiscoveryRoot';

function loadStoredDiscoveryRoot(): string {
  try {
    const raw = window.localStorage.getItem(DISCOVERY_ROOT_KEY);
    if (raw && raw.trim()) return raw.trim();
  } catch {
    /* ignore */
  }
  return 'sagas';
}

/**
 * Agentic & Saga Workspace settings dialog.
 * All settings are automatically applied and persisted immediately on change.
 */
export function SettingsDialog({
  currentSagaPath,
  onPickSaga,
  onClose,
}: Props) {
  const [cfg, setCfg] = useState<MaskedLoreweaveConfig | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [discoveryRootSeed, setDiscoveryRootSeed] = useState<string>(() =>
    loadStoredDiscoveryRoot(),
  );
  const debounceTimer = useRef<number | null>(null);

  // Chat fields
  const [chatProvider, setChatProvider] = useState<ChatProviderId | ''>('');
  const [chatModel, setChatModel] = useState<string>('');
  const [ollamaHost, setOllamaHost] = useState<string>('');
  const [customBaseUrl, setCustomBaseUrl] = useState<string>('');
  const [keys, setKeys] = useState<Partial<Record<KeyFieldName, string>>>({});
  const [customChatModelMode, setCustomChatModelMode] = useState(false);

  // Chat model discovery state
  const [chatDiscovery, setChatDiscovery] =
    useState<ModelsDiscoveryResponse | null>(null);
  const [chatDiscovering, setChatDiscovering] = useState(false);
  const [chatRefreshTick, setChatRefreshTick] = useState(0);

  // Embeddings fields
  const [embProvider, setEmbProvider] = useState<EmbeddingsProviderId | ''>('');
  const [embModel, setEmbModel] = useState<string>('');
  const [embEndpoint, setEmbEndpoint] = useState<string>('');
  const [embKey, setEmbKey] = useState<string>('');
  const [customEmbModelMode, setCustomEmbModelMode] = useState(false);

  // Embeddings model discovery state
  const [embDiscovery, setEmbDiscovery] =
    useState<ModelsDiscoveryResponse | null>(null);
  const [embDiscovering, setEmbDiscovering] = useState(false);
  const [embRefreshTick, setEmbRefreshTick] = useState(0);

  const isInitialLoad = useRef(true);
  const draftRef = useRef<DraftState>({
    chatProvider: '',
    chatModel: '',
    ollamaHost: '',
    customBaseUrl: '',
    keys: {},
    embProvider: '',
    embModel: '',
    embEndpoint: '',
    embKey: '',
  });

  // Fetch initial config from sidecar
  useEffect(() => {
    fetchConfig()
      .then((c) => {
        setCfg(c);
        if (c.sagaRoot && c.sagaRoot.trim()) {
          setDiscoveryRootSeed(c.sagaRoot.trim());
        }
        const cp = c.chat.provider ?? '';
        const cm = c.chat.model ?? '';
        const oh = c.chat.ollamaHost ?? '';
        const cbu = c.chat.customBaseUrl ?? '';
        const ep = c.embeddings.provider ?? '';
        const em = c.embeddings.model ?? '';
        const ee = c.embeddings.endpoint ?? '';

        setChatProvider(cp);
        setChatModel(cm);
        setOllamaHost(oh);
        setCustomBaseUrl(cbu);
        setEmbProvider(ep);
        setEmbModel(em);
        setEmbEndpoint(ee);

        draftRef.current = {
          chatProvider: cp,
          chatModel: cm,
          ollamaHost: oh,
          customBaseUrl: cbu,
          keys: {},
          embProvider: ep,
          embModel: em,
          embEndpoint: ee,
          embKey: '',
        };
        isInitialLoad.current = false;
      })
      .catch((e) => {
        setSaveStatus('error');
        setStatusMessage((e as Error).message);
        isInitialLoad.current = false;
      });
  }, []);

  useEffect(() => {
    playModalOpen();
    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, []);

  const flushSave = useCallback(async () => {
    if (isInitialLoad.current) return;
    const d = draftRef.current;
    try {
      const chatPatch: NonNullable<ConfigPatch['chat']> = {
        provider: d.chatProvider === '' ? null : d.chatProvider,
        model: d.chatModel.trim() === '' ? null : d.chatModel.trim(),
        ollamaHost: d.ollamaHost.trim() === '' ? null : d.ollamaHost.trim(),
        customBaseUrl:
          d.customBaseUrl.trim() === '' ? null : d.customBaseUrl.trim(),
      };
      const clearedKeyFields: KeyFieldName[] = [];
      for (const field of ALL_KEY_FIELDS) {
        const val = d.keys[field];
        if (val === '-') {
          chatPatch[field] = null;
          clearedKeyFields.push(field);
        } else if (val && val.trim()) {
          chatPatch[field] = val.trim();
        }
      }

      const embPatch: NonNullable<ConfigPatch['embeddings']> = {
        provider: d.embProvider === '' ? null : d.embProvider,
        model: d.embModel.trim() === '' ? null : d.embModel.trim(),
        endpoint: d.embEndpoint.trim() === '' ? null : d.embEndpoint.trim(),
      };
      let clearedEmbKey = false;
      if (d.embKey === '-') {
        embPatch.apiKey = null;
        clearedEmbKey = true;
      } else if (d.embKey.trim()) {
        embPatch.apiKey = d.embKey.trim();
      }

      const updated = await saveConfigPatch({
        chat: chatPatch,
        embeddings: embPatch,
      });
      setCfg(updated);

      if (clearedKeyFields.length > 0) {
        setKeys((prev) => {
          const next = { ...prev };
          for (const f of clearedKeyFields) delete next[f];
          draftRef.current.keys = next;
          return next;
        });
      }
      if (clearedEmbKey) {
        setEmbKey('');
        draftRef.current.embKey = '';
      }

      window.dispatchEvent(
        new CustomEvent('lw-config-updated', { detail: updated }),
      );

      setSaveStatus('saved');
      setStatusMessage('All changes saved');
      window.setTimeout(() => {
        setSaveStatus((cur) => (cur === 'saved' ? 'idle' : cur));
      }, 1800);
    } catch (e) {
      setSaveStatus('error');
      setStatusMessage((e as Error).message);
    }
  }, []);

  const scheduleSave = useCallback(
    (delayMs = 350) => {
      if (isInitialLoad.current) return;
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      setSaveStatus('saving');
      setStatusMessage('Saving…');
      debounceTimer.current = window.setTimeout(() => {
        debounceTimer.current = null;
        void flushSave();
      }, delayMs);
    },
    [flushSave],
  );

  // Active key value for the currently selected chat provider (if typed in this session)
  const activeMeta = chatProvider ? PROVIDER_UI[chatProvider] : null;
  const activeTypedChatKey = activeMeta ? (keys[activeMeta.keyField] ?? '') : '';
  const validTypedChatKey =
    activeTypedChatKey && activeTypedChatKey !== '-'
      ? activeTypedChatKey.trim()
      : undefined;

  // Live model discovery for Chat provider
  useEffect(() => {
    if (!cfg || !chatProvider) {
      setChatDiscovery(null);
      setChatDiscovering(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setChatDiscovering(true);
      fetchProviderModels(
        {
          provider: chatProvider,
          apiKey: validTypedChatKey,
          ollamaHost: chatProvider === 'ollama' ? ollamaHost : undefined,
          ollamaApiKey:
            chatProvider === 'ollama' ? validTypedChatKey : undefined,
          baseUrl:
            chatProvider === 'openai-compatible' ? customBaseUrl : undefined,
        },
        controller.signal,
      )
        .then((res) => {
          if (!controller.signal.aborted) {
            setChatDiscovery(res);
          }
        })
        .catch(() => {
          // Ignore aborted requests
        })
        .finally(() => {
          if (!controller.signal.aborted) setChatDiscovering(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    cfg,
    chatProvider,
    validTypedChatKey,
    ollamaHost,
    customBaseUrl,
    chatRefreshTick,
  ]);

  // Live model discovery for Embeddings provider
  const validTypedEmbKey =
    embKey && embKey !== '-' ? embKey.trim() : undefined;
  const inheritedChatKeyForEmb = useMemo(() => {
    if (embProvider === 'ollama') {
      const k = keys.ollamaApiKey;
      return k && k !== '-' ? k.trim() : undefined;
    }
    if (embProvider === 'openai') {
      const k = keys.openaiApiKey;
      return k && k !== '-' ? k.trim() : undefined;
    }
    if (embProvider === 'google') {
      const k = keys.googleApiKey;
      return k && k !== '-' ? k.trim() : undefined;
    }
    if (embProvider === 'openai-compatible') {
      const k = keys.customApiKey;
      return k && k !== '-' ? k.trim() : undefined;
    }
    return undefined;
  }, [embProvider, keys]);

  useEffect(() => {
    if (!cfg || !embProvider) {
      setEmbDiscovery(null);
      setEmbDiscovering(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setEmbDiscovering(true);
      const effectiveKey = validTypedEmbKey ?? inheritedChatKeyForEmb;
      fetchProviderModels(
        {
          provider: embProvider,
          scope: 'embeddings',
          apiKey: effectiveKey,
          ollamaHost:
            embProvider === 'ollama'
              ? embEndpoint.trim() || ollamaHost.trim() || undefined
              : undefined,
          ollamaApiKey: embProvider === 'ollama' ? effectiveKey : undefined,
          baseUrl:
            embProvider === 'openai-compatible'
              ? embEndpoint.trim() || customBaseUrl.trim() || undefined
              : undefined,
        },
        controller.signal,
      )
        .then((res) => {
          if (!controller.signal.aborted) {
            setEmbDiscovery(res);
          }
        })
        .catch(() => {
          // Ignore aborted requests
        })
        .finally(() => {
          if (!controller.signal.aborted) setEmbDiscovering(false);
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    cfg,
    embProvider,
    validTypedEmbKey,
    inheritedChatKeyForEmb,
    embEndpoint,
    ollamaHost,
    customBaseUrl,
    embRefreshTick,
  ]);

  const chatModels: ModelDescriptor[] = chatDiscovery?.models ?? [];
  const chatModelInList =
    chatModel === '' || chatModels.some((m) => m.id === chatModel);

  const embModels: ModelDescriptor[] = embDiscovery?.embeddingModels ?? [];
  const embModelInList =
    embModel === '' || embModels.some((m) => m.id === embModel);

  const savedChatProviders = useMemo(() => {
    if (!cfg) return [];
    const list: ChatProviderId[] = [];
    for (const pid of [...CLOUD_PROVIDERS, ...LOCAL_PROVIDERS]) {
      const meta = PROVIDER_UI[pid];
      if (cfg.chat[meta.keyField]) list.push(pid);
    }
    if (cfg.chat.ollamaHost && !list.includes('ollama')) list.push('ollama');
    if (cfg.chat.customBaseUrl && !list.includes('openai-compatible')) {
      list.push('openai-compatible');
    }
    return list;
  }, [cfg]);

  const handleClose = () => {
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
      void flushSave();
    }
    playModalClose();
    onClose();
  };

  const selectChatProvider = (next: ChatProviderId | '') => {
    const prev = draftRef.current.chatProvider;
    setChatProvider(next);
    draftRef.current.chatProvider = next;
    if (prev !== next) {
      setChatModel('');
      draftRef.current.chatModel = '';
      setCustomChatModelMode(false);
    }
    scheduleSave(80);
  };

  const updateKeyField = (field: KeyFieldName, val: string) => {
    setKeys((prev) => {
      const next = { ...prev, [field]: val };
      draftRef.current.keys = next;
      return next;
    });
    scheduleSave(350);
  };

  const embInheritedNote = useMemo(() => {
    if (!cfg || !embProvider) return null;
    if (embProvider === 'ollama') {
      if (embEndpoint || cfg.embeddings.apiKey) return null;
      if (ollamaHost || cfg.chat.ollamaHost || cfg.chat.ollamaApiKey) {
        return 'Reusing your configured Ollama host & token automatically.';
      }
      return 'Uses local Ollama (127.0.0.1:11434) unless overridden below.';
    }
    if (embProvider === 'google') {
      if (cfg.embeddings.apiKey || embKey) return null;
      if (cfg.chat.googleApiKey || keys.googleApiKey) {
        return 'Reusing your saved Google Gemini API key automatically.';
      }
      return 'Configure a Google AI Studio key above or supply an override key below.';
    }
    if (embProvider === 'openai') {
      if (cfg.embeddings.apiKey || embKey) return null;
      if (cfg.chat.openaiApiKey || keys.openaiApiKey) {
        return 'Reusing your saved OpenAI API key automatically.';
      }
      return 'Configure an OpenAI API key above or supply an override key below.';
    }
    if (embProvider === 'openai-compatible') {
      if (embEndpoint || cfg.embeddings.endpoint) return null;
      if (customBaseUrl || cfg.chat.customBaseUrl) {
        return 'Reusing your custom OpenAI-compatible Base URL automatically.';
      }
    }
    return null;
  }, [cfg, embProvider, embEndpoint, embKey, ollamaHost, customBaseUrl, keys]);

  const modal = (
    <div
      className="fixed inset-0 z-[100] bg-background/45 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl panel-glass bg-card/90 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-modal-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Agentic &amp; Workspace Settings
            </h2>
            {saveStatus === 'saving' && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Saving…</span>
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">
                <Check className="h-3 w-3" />
                <span>{statusMessage ?? 'Saved'}</span>
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
                <span>{statusMessage ?? 'Save failed'}</span>
              </span>
            )}
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            onClick={handleClose}
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 scrollbar-ember">
          <SagaWorkspaceSection
            initialRoot={discoveryRootSeed}
            currentSagaPath={currentSagaPath}
            onPickSaga={(p) => {
              onPickSaga?.(p);
              handleClose();
            }}
          />

          <hr className="border-border/60" />

          {cfg && cfg.envOverrides.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                External environment variables are overriding saved settings:{' '}
                <code className="font-mono text-amber-300">
                  {cfg.envOverrides.join(', ')}
                </code>
              </div>
            )}

            <section className="space-y-4">
              <div>
                <h3 className="text-xs uppercase tracking-wider font-semibold text-primary">
                  Scribe Model Provider
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connect any cloud API, local Ollama, or remote OpenAI-compatible server. Available models are discovered automatically.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-xs">
                  <span className="text-muted-foreground mb-1 block font-medium">
                    Provider
                  </span>
                  <select
                    className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
                    value={chatProvider}
                    onChange={(e) =>
                      selectChatProvider(e.target.value as ChatProviderId | '')
                    }
                  >
                    <option value="">(auto-detect / offline)</option>
                    <optgroup label="Cloud APIs">
                      {CLOUD_PROVIDERS.map((pid) => (
                        <option key={pid} value={pid}>
                          {PROVIDER_UI[pid].label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Local & Custom Endpoints">
                      {LOCAL_PROVIDERS.map((pid) => (
                        <option key={pid} value={pid}>
                          {PROVIDER_UI[pid].label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>

                <div className="block text-xs">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-muted-foreground font-medium">
                      Model
                    </span>
                    {chatProvider && (
                      <div className="flex items-center gap-1.5">
                        <DiscoveryBadge
                          loading={chatDiscovering}
                          discovery={chatDiscovery}
                        />
                        <button
                          type="button"
                          onClick={() => setChatRefreshTick((n) => n + 1)}
                          title="Refresh available models"
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        >
                          <RefreshCw
                            className={cn(
                              'h-3 w-3',
                              chatDiscovering && 'animate-spin',
                            )}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCustomChatModelMode((prev) => !prev)
                          }
                          title="Enter custom model ID manually"
                          className={cn(
                            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border transition-colors',
                            customChatModelMode || !chatModelInList
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border/70 text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <Pencil className="h-2.5 w-2.5" />
                          <span>Custom</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {!chatProvider ? (
                    <input
                      className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
                      placeholder="Select a provider or enter model ID"
                      value={chatModel}
                      onChange={(e) => {
                        setChatModel(e.target.value);
                        draftRef.current.chatModel = e.target.value;
                        scheduleSave(350);
                      }}
                    />
                  ) : customChatModelMode || !chatModelInList ? (
                    <input
                      className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
                      placeholder={
                        chatDiscovery?.defaultModel ??
                        activeMeta?.defaultModel ??
                        'Model ID'
                      }
                      value={chatModel}
                      onChange={(e) => {
                        setChatModel(e.target.value);
                        draftRef.current.chatModel = e.target.value;
                        scheduleSave(350);
                      }}
                      onBlur={() => scheduleSave(50)}
                    />
                  ) : (
                    <select
                      className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
                      value={chatModel}
                      onChange={(e) => {
                        const val = e.target.value;
                        setChatModel(val);
                        draftRef.current.chatModel = val;
                        scheduleSave(80);
                      }}
                    >
                      <option value="">
                        (default:{' '}
                        {chatDiscovery?.defaultModel ??
                          activeMeta?.defaultModel ??
                          'auto'}
                        )
                      </option>
                      {chatModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                          {m.recommended ? ' ★' : ''}
                          {m.description ? ` — ${m.description}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {chatProvider && chatDiscovery?.error && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200 flex items-start justify-between gap-2">
                  <span>
                    Model discovery note ({chatDiscovery.resolvedEndpoint}):{' '}
                    {chatDiscovery.error}. Showing curated defaults.
                  </span>
                </div>
              )}

              {chatProvider === 'ollama' &&
                chatDiscovery?.connected &&
                chatDiscovery.models.length === 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    Connected to Ollama at{' '}
                    <code className="font-mono">
                      {chatDiscovery.resolvedEndpoint}
                    </code>
                    , but no models are installed yet. Run{' '}
                    <code className="font-mono">ollama pull llama3.1</code> on
                    that host and click refresh.
                  </div>
                )}

              {/* Contextual provider credentials */}
              {!chatProvider && savedChatProviders.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                  <div className="text-[11px] text-muted-foreground">
                    Saved credentials found — pick one to activate explicitly:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {savedChatProviders.map((pid) => (
                      <button
                        key={pid}
                        type="button"
                        onClick={() => selectChatProvider(pid)}
                        className="rounded-md border border-border bg-background/80 px-2.5 py-1 text-[11px] hover:border-primary/50 hover:text-primary transition-colors"
                      >
                        {PROVIDER_UI[pid].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatProvider && activeMeta && (
                <div className="rounded-lg border border-border/60 bg-muted/15 p-4 space-y-3">
                  {chatProvider === 'ollama' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground font-medium">
                          Ollama Server URL
                        </span>
                        <div className="flex items-center gap-1.5">
                          <PresetPill
                            label="Local (:11434)"
                            active={
                              ollamaHost === '' ||
                              ollamaHost === 'http://127.0.0.1:11434'
                            }
                            onClick={() => {
                              const next = 'http://127.0.0.1:11434';
                              setOllamaHost(next);
                              draftRef.current.ollamaHost = next;
                              scheduleSave(80);
                            }}
                          />
                          <PresetPill
                            label="Ollama Cloud (ollama.com)"
                            active={ollamaHost === 'https://ollama.com'}
                            onClick={() => {
                              const next = 'https://ollama.com';
                              setOllamaHost(next);
                              draftRef.current.ollamaHost = next;
                              scheduleSave(80);
                            }}
                          />
                        </div>
                      </div>
                      <input
                        className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
                        placeholder="http://127.0.0.1:11434 (or remote URL / https://ollama.com)"
                        value={ollamaHost}
                        onChange={(e) => {
                          setOllamaHost(e.target.value);
                          draftRef.current.ollamaHost = e.target.value;
                          scheduleSave(350);
                        }}
                        onBlur={() => scheduleSave(50)}
                      />
                    </div>
                  )}

                  {chatProvider === 'openai-compatible' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground font-medium">
                          Base URL (OpenAI v1 compatible)
                        </span>
                        <div className="flex items-center gap-1.5">
                          <PresetPill
                            label="LM Studio (:1234)"
                            active={customBaseUrl === 'http://127.0.0.1:1234/v1'}
                            onClick={() => {
                              const next = 'http://127.0.0.1:1234/v1';
                              setCustomBaseUrl(next);
                              draftRef.current.customBaseUrl = next;
                              scheduleSave(80);
                            }}
                          />
                          <PresetPill
                            label="vLLM (:8000)"
                            active={customBaseUrl === 'http://127.0.0.1:8000/v1'}
                            onClick={() => {
                              const next = 'http://127.0.0.1:8000/v1';
                              setCustomBaseUrl(next);
                              draftRef.current.customBaseUrl = next;
                              scheduleSave(80);
                            }}
                          />
                          <PresetPill
                            label="llama.cpp (:8080)"
                            active={customBaseUrl === 'http://127.0.0.1:8080/v1'}
                            onClick={() => {
                              const next = 'http://127.0.0.1:8080/v1';
                              setCustomBaseUrl(next);
                              draftRef.current.customBaseUrl = next;
                              scheduleSave(80);
                            }}
                          />
                        </div>
                      </div>
                      <input
                        className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
                        placeholder="http://127.0.0.1:1234/v1"
                        value={customBaseUrl}
                        onChange={(e) => {
                          setCustomBaseUrl(e.target.value);
                          draftRef.current.customBaseUrl = e.target.value;
                          scheduleSave(350);
                        }}
                        onBlur={() => scheduleSave(50)}
                      />
                    </div>
                  )}

                  <KeyField
                    label={activeMeta.keyLabel}
                    placeholder={activeMeta.keyPlaceholder}
                    saved={!!cfg?.chat[activeMeta.keyField]}
                    value={keys[activeMeta.keyField] ?? ''}
                    helpUrl={activeMeta.keyHelpUrl}
                    helpLabel={activeMeta.keyHelpLabel}
                    setValue={(v) => updateKeyField(activeMeta.keyField, v)}
                    onBlur={() => scheduleSave(50)}
                  />

                  {chatProvider === 'google' && (
                    <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
                      <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-foreground/90 font-medium">
                          Using a Google AI Pro / Google account
                        </p>
                        <p>
                          Google AI Pro subscriptions cover the consumer Gemini web app and do not include a direct OAuth login for third-party desktop apps. You can still use Gemini 2.5 Pro & Flash right here by creating a free API key in{' '}
                          <a
                            href="https://aistudio.google.com/apikey"
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline hover:opacity-80"
                          >
                            Google AI Studio
                          </a>{' '}
                          with your Google account.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <div className="border-t border-border/50 pt-5 space-y-4">
              <div>
                <h3 className="text-xs uppercase tracking-wider font-semibold text-primary">
                  Vector Embeddings (Semantic Search)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Used by <code>semantic_search</code> to index and retrieve lore context.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-xs">
                  <span className="text-muted-foreground mb-1 block font-medium">
                    Provider
                  </span>
                  <select
                    className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
                    value={embProvider}
                    onChange={(e) => {
                      const next = e.target.value as EmbeddingsProviderId | '';
                      const prev = draftRef.current.embProvider;
                      setEmbProvider(next);
                      draftRef.current.embProvider = next;
                      if (prev !== next) {
                        setEmbModel('');
                        draftRef.current.embModel = '';
                        setCustomEmbModelMode(false);
                      }
                      scheduleSave(80);
                    }}
                  >
                    <option value="">(disabled)</option>
                    <option value="ollama">Ollama (Local / Remote / Cloud)</option>
                    <option value="google">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="openai-compatible">
                      OpenAI-compatible (Custom Endpoint)
                    </option>
                  </select>
                </label>

                <div className="block text-xs">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-muted-foreground font-medium">
                      Model
                    </span>
                    {embProvider && (
                      <div className="flex items-center gap-1.5">
                        <DiscoveryBadge
                          loading={embDiscovering}
                          discovery={embDiscovery}
                          count={embModels.length}
                        />
                        <button
                          type="button"
                          onClick={() => setEmbRefreshTick((n) => n + 1)}
                          title="Refresh embedding models"
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        >
                          <RefreshCw
                            className={cn(
                              'h-3 w-3',
                              embDiscovering && 'animate-spin',
                            )}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCustomEmbModelMode((prev) => !prev)
                          }
                          title="Enter custom embedding model ID manually"
                          className={cn(
                            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border transition-colors',
                            customEmbModelMode || !embModelInList
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border/70 text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <Pencil className="h-2.5 w-2.5" />
                          <span>Custom</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {!embProvider ? (
                    <input
                      disabled
                      className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 font-mono text-xs text-muted-foreground"
                      placeholder="Disabled"
                      value=""
                    />
                  ) : customEmbModelMode || !embModelInList ? (
                    <input
                      className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
                      placeholder={
                        embDiscovery?.defaultEmbeddingModel ?? 'nomic-embed-text'
                      }
                      value={embModel}
                      onChange={(e) => {
                        setEmbModel(e.target.value);
                        draftRef.current.embModel = e.target.value;
                        scheduleSave(350);
                      }}
                      onBlur={() => scheduleSave(50)}
                    />
                  ) : (
                    <select
                      className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
                      value={embModel}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEmbModel(val);
                        draftRef.current.embModel = val;
                        scheduleSave(80);
                      }}
                    >
                      <option value="">
                        (default:{' '}
                        {embDiscovery?.defaultEmbeddingModel ??
                          (embProvider === 'ollama'
                            ? 'nomic-embed-text'
                            : embProvider === 'google'
                              ? 'gemini-embedding-001'
                              : 'text-embedding-3-small')}
                        )
                      </option>
                      {embModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                          {m.recommended ? ' ★' : ''}
                          {m.description ? ` — ${m.description}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {embProvider && (
                <div className="rounded-lg border border-border/60 bg-muted/15 p-4 space-y-3">
                  {embInheritedNote && (
                    <div className="text-[11px] text-muted-foreground">
                      {embInheritedNote}
                    </div>
                  )}

                  {(embProvider === 'ollama' ||
                    embProvider === 'openai-compatible') && (
                    <label className="block text-xs">
                      <span className="text-muted-foreground mb-1 block font-medium">
                        Embeddings Endpoint{' '}
                        <span className="font-normal opacity-75">
                          (optional override)
                        </span>
                      </span>
                      <input
                        className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
                        placeholder={
                          embProvider === 'ollama'
                            ? ollamaHost || 'http://127.0.0.1:11434'
                            : customBaseUrl || 'https://api.openai.com/v1'
                        }
                        value={embEndpoint}
                        onChange={(e) => {
                          setEmbEndpoint(e.target.value);
                          draftRef.current.embEndpoint = e.target.value;
                          scheduleSave(350);
                        }}
                        onBlur={() => scheduleSave(50)}
                      />
                    </label>
                  )}

                  <KeyField
                    label="Embeddings API Key (optional override)"
                    placeholder="Leave blank to reuse provider key above"
                    saved={!!cfg?.embeddings.apiKey}
                    value={embKey}
                    setValue={(v) => {
                      setEmbKey(v);
                      draftRef.current.embKey = v;
                      scheduleSave(350);
                    }}
                    onBlur={() => scheduleSave(50)}
                  />
                </div>
              )}
            </div>

            {cfg && (
              <div className="rounded-lg bg-muted/20 border border-border/40 p-3 text-[11px] text-muted-foreground">
                Configurations are securely saved to{' '}
                <code className="font-mono text-foreground/80">{cfg.path}</code>{' '}
                (mode <code>0600</code>). Secrets are never committed to git
                repositories.
              </div>
            )}
          </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modal, document.body)
    : modal;
}

function DiscoveryBadge({
  loading,
  discovery,
  count,
}: {
  loading: boolean;
  discovery: ModelsDiscoveryResponse | null;
  count?: number;
}) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        <span>Checking…</span>
      </span>
    );
  }
  if (!discovery) return null;
  const n = count ?? discovery.models.length;
  if (discovery.source === 'live' && discovery.connected) {
    return (
      <span
        title={
          discovery.resolvedEndpoint
            ? `Live models from ${discovery.resolvedEndpoint}`
            : undefined
        }
        className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.2 text-[10px] text-emerald-300"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <span>
          Connected · {n} {n === 1 ? 'model' : 'models'}
        </span>
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted/60 border border-border/70 px-2 py-0.2 text-[10px] text-muted-foreground">
      Curated list
    </span>
  );
}

function PresetPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] transition-colors',
        active
          ? 'border-primary/50 bg-primary/15 text-primary font-medium'
          : 'border-border/70 bg-background/60 text-muted-foreground hover:text-foreground hover:border-border',
      )}
    >
      {label}
    </button>
  );
}

function KeyField({
  label,
  placeholder,
  saved,
  value,
  helpUrl,
  helpLabel,
  setValue,
  onBlur,
}: {
  label: string;
  placeholder?: string;
  saved: boolean;
  value: string;
  helpUrl?: string;
  helpLabel?: string;
  setValue: (v: string) => void;
  onBlur?: () => void;
}) {
  return (
    <label className="block text-xs">
      <div className="mb-1 flex items-center justify-between gap-2 text-muted-foreground font-medium">
        <div className="flex items-center gap-2">
          <span>{label}</span>
          {saved && (
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.2 text-[10px] text-emerald-300 font-mono">
              saved
            </span>
          )}
        </div>
        {helpUrl && (
          <a
            href={helpUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-normal text-primary hover:underline"
          >
            <span>{helpLabel ?? 'Get key'}</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-lg border border-border bg-background/80 px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
        placeholder={
          saved
            ? '••••••••  (type to update, type `-` to clear)'
            : (placeholder ?? 'sk-…')
        }
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onBlur}
      />
    </label>
  );
}

function SagaWorkspaceSection({
  initialRoot,
  currentSagaPath,
  onPickSaga,
}: {
  initialRoot: string;
  currentSagaPath?: string;
  onPickSaga: (path: string) => void;
}) {
  const [sagaRoot, setSagaRoot] = useState(initialRoot);
  const rootEditedRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredSaga[] | null>(null);
  const [scanSuccessMsg, setScanSuccessMsg] = useState<string | null>(null);

  const [directPath, setDirectPath] = useState(currentSagaPath ?? '');
  const [verifyingDirect, setVerifyingDirect] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);

  useEffect(() => {
    if (!rootEditedRef.current) {
      setSagaRoot(initialRoot);
    }
  }, [initialRoot]);

  const scanRoot = async () => {
    const dir = sagaRoot.trim() || 'sagas';
    setScanning(true);
    setScanError(null);
    setScanSuccessMsg(null);
    try {
      const list = await listSagas(dir);
      setDiscovered(list);
      if (list.length > 0) {
        try {
          window.localStorage.setItem(DISCOVERY_ROOT_KEY, dir);
        } catch {
          /* ignore */
        }
        await saveConfigPatch({ sagaRoot: dir }).catch(() => {});
        setScanSuccessMsg(
          `Saved discovery path & found ${list.length} Saga${list.length === 1 ? '' : 's'}.`,
        );
      } else {
        setScanSuccessMsg(null);
        setScanError(
          `No valid Sagas found under "${dir}". Keep current workspace or choose another directory.`,
        );
      }
    } catch (e) {
      setDiscovered(null);
      setScanError(
        `Could not scan "${dir}": ${(e as Error).message}. Existing workspace stays intact.`,
      );
    } finally {
      setScanning(false);
    }
  };

  const verifyAndOpenDirect = async () => {
    const target = directPath.trim();
    if (!target) return;
    setVerifyingDirect(true);
    setDirectError(null);
    try {
      await dump(target);
      onPickSaga(target);
    } catch (e) {
      setDirectError(
        `"${target}" is not a readable Saga (${(e as Error).message}).`,
      );
    } finally {
      setVerifyingDirect(false);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xs uppercase tracking-wider font-semibold text-primary flex items-center gap-1.5">
          <FolderSearch className="h-3.5 w-3.5" />
          <span>Saga Workspace &amp; Discovery Path</span>
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Set the folder scanned by the top-left Saga menu or verify and open a custom Saga path directly.
        </p>
      </div>

      {/* Discovery root scanner */}
      <div className="rounded-xl border border-border/70 bg-card/45 p-4 space-y-3">
        <label className="block text-xs">
          <span className="text-muted-foreground mb-1 block font-medium">
            Discovery Directory
          </span>
          <div className="flex gap-2">
            <input
              type="text"
              value={sagaRoot}
              onChange={(e) => {
                rootEditedRef.current = true;
                setSagaRoot(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void scanRoot();
                }
              }}
              placeholder="sagas or D:\Writing\Sagas"
              className="flex-1 rounded-lg border border-border bg-background/80 px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => void scanRoot()}
              disabled={scanning}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/15 px-3.5 py-2 text-xs font-semibold text-primary hover:bg-primary/25 disabled:opacity-50 transition-colors shrink-0"
            >
              {scanning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span>{scanning ? 'Scanning…' : 'Scan & Verify'}</span>
            </button>
          </div>
        </label>

        {scanSuccessMsg && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">
            {scanSuccessMsg}
          </div>
        )}

        {scanError && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            {scanError}
          </div>
        )}

        {discovered && discovered.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="label-rune">Detected Sagas</div>
            <ul className="space-y-1.5 max-h-40 overflow-auto scrollbar-ember">
              {discovered.map((s) => {
                const active = s.path === currentSagaPath;
                return (
                  <li
                    key={s.path}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs',
                      active
                        ? 'active-theme-pill text-foreground'
                        : 'border-border/60 bg-background/50',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {s.title ?? s.id}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground truncate">
                        {s.path}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onPickSaga(s.path)}
                      disabled={active}
                      className="shrink-0 rounded-lg border border-primary/40 bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
                    >
                      {active ? 'Active' : 'Load Saga'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Direct path verifier */}
        <label className="block text-xs pt-2 border-t border-border/50">
          <span className="text-muted-foreground mb-1 block font-medium">
            Custom Single Saga Path
          </span>
          <div className="flex gap-2">
            <input
              type="text"
              value={directPath}
              onChange={(e) => setDirectPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void verifyAndOpenDirect();
                }
              }}
              placeholder="C:\path\to\my-saga or sagas/example-saga"
              className="flex-1 rounded-lg border border-border bg-background/80 px-3 py-2 font-mono text-xs focus:ring-1 focus:ring-primary focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => void verifyAndOpenDirect()}
              disabled={!directPath.trim() || verifyingDirect}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/70 px-3.5 py-2 text-xs font-medium text-foreground hover:border-primary/50 hover:text-primary disabled:opacity-40 transition-colors shrink-0"
            >
              {verifyingDirect && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Verify &amp; Open</span>
            </button>
          </div>
        </label>

        {directError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
            {directError}
          </div>
        )}
      </div>
    </section>
  );
}
