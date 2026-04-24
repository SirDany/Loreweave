/**
 * Pick an LLM provider + model.
 *
 * Settings come from two sources, in order of precedence:
 *   1. Environment variables (for CI / power users)
 *   2. The user config file at `~/.loreweave/config.json`
 *      (managed from the web UI's Settings dialog; applied to
 *      `process.env` at sidecar startup by `applyConfigToEnv()`).
 *
 * Recognised env vars:
 *   LW_AI_PROVIDER=anthropic|openai|ollama  (optional, auto-detected)
 *   LW_AI_MODEL=<model-id>                  (optional; sane defaults per provider)
 *   ANTHROPIC_API_KEY / OPENAI_API_KEY      (API-key providers)
 *   OLLAMA_HOST=http://localhost:11434      (local)
 */
export async function resolveModel() {
  const explicit = process.env.LW_AI_PROVIDER?.toLowerCase();
  const provider =
    explicit ??
    (process.env.ANTHROPIC_API_KEY
      ? 'anthropic'
      : process.env.OPENAI_API_KEY
        ? 'openai'
        : process.env.OLLAMA_HOST
          ? 'ollama'
          : undefined);
  if (!provider) {
    throw new Error(
      'No LLM provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, ' +
        'or OLLAMA_HOST (and optionally LW_AI_PROVIDER / LW_AI_MODEL) in the dev server env.',
    );
  }
  if (provider === 'anthropic') {
    const { anthropic } = await import('@ai-sdk/anthropic');
    return anthropic(process.env.LW_AI_MODEL ?? 'claude-3-5-sonnet-latest');
  }
  if (provider === 'openai') {
    const { openai } = await import('@ai-sdk/openai');
    return openai(process.env.LW_AI_MODEL ?? 'gpt-4o-mini');
  }
  if (provider === 'ollama') {
    // `ollama-ai-provider` is peer-compatible with the Vercel AI SDK.
    // It's an optional runtime dep; import lazily so writers without
    // Ollama don't need the package installed.
    try {
      const mod = (await import('ollama-ai-provider')) as unknown as {
        createOllama: (opts: { baseURL: string }) => (model: string) => unknown;
      };
      const baseURL =
        (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(
          /\/$/,
          '',
        ) + '/api';
      const ollama = mod.createOllama({ baseURL });
      return ollama(process.env.LW_AI_MODEL ?? 'llama3.1');
    } catch (e) {
      throw new Error(
        'Ollama requested but `ollama-ai-provider` is not installed. ' +
          'Run `pnpm --filter @loreweave/sidecar add ollama-ai-provider` and retry. ' +
          `(inner: ${(e as Error).message})`,
      );
    }
  }
  throw new Error(`Unknown LW_AI_PROVIDER: ${provider}`);
}
