export {
  registerSidecar,
  type SidecarOptions,
  type SidecarHandle,
  type MiddlewareHost,
} from './middleware.js';
export {
  runTool,
  toolDescriptors,
  toolSchemas,
  sanitizeForModel,
  hashContent,
  type ToolName,
  type ToolContext,
  type ToolResult,
  type ToolDescriptor,
  type RunToolOptions,
} from './tools.js';
export { loadAgents, type AgentDescriptor } from './agents.js';
export {
  getDigest,
  invalidateDigest,
  renderDigestForPrompt,
  revisionFor,
  type GetDigestOptions,
} from './digest-cache.js';
export {
  CHAT_PROVIDERS,
  EMBEDDING_PROVIDERS,
  type ChatProvider,
  type EmbeddingsProvider,
  type ChatConfig,
  type EmbeddingsConfig,
  type LoreweaveConfig,
  type MaskedConfig,
} from './config.js';
export {
  resolveModel,
  discoverModels,
  getModelProfile,
  PROVIDER_CATALOG,
  normalizeOllamaBase,
  detectActiveProvider,
  getGoogleApiKey,
  type ModelDescriptor,
  type ProviderMeta,
  type DiscoverModelsOptions,
  type ModelsDiscoveryResult,
  type ModelCapabilityProfile,
  type ModelTier,
} from './model.js';
export { safeJoin } from './paths.js';
export { loadSagaRules, type SagaRulesResult } from './saga-rules.js';
