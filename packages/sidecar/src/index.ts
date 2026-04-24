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
export { resolveModel } from './model.js';
export { safeJoin } from './paths.js';
