export {
  type LLMProvider,
  type ModelDefinition,
  type ModelTier,
  type CostTier,
  MODEL_REGISTRY,
  getModelDef,
  resolveFromTier,
  getModelsByProvider,
  getModelsGrouped,
  getModelsForProviders,
  getModelTierValue,
} from "./model-registry";

export {
  type ProviderKey,
  type ProviderDefinition,
  PROVIDER_KEYS,
  PROVIDERS,
  getProvider,
} from "./providers";

export {
  type TranslatedError,
  translateProviderError,
  resetRateLimitCounter,
} from "./error-translator";

export {
  type KeyValidationResult,
  validateApiKey,
} from "./key-validator";

export {
  type LLMClientOptions,
  type LLMClient,
  type ProviderRouteResult,
  createLLMClient,
  resolveProviderRoute,
  toOpenRouterModelId,
} from "./client-factory";

export {
  type AgentRole,
  type ResolutionSource,
  type ResolvedModel,
  type BookModelSettings,
  AGENT_ROLES,
  resolveModelForRole,
  meetsMinimumTier,
  mapAgentTypeToRole,
} from "./model-resolver";

export {
  type TokenEstimate,
  type CostEstimate,
  WORKFLOW_TOKEN_ESTIMATES,
  estimateWorkflowCost,
  formatCostRange,
} from "./cost-estimator";

export {
  RETRY_CONFIG,
  type RetryOptions,
  ProviderError,
  withProviderRetry,
} from "./retry-handler";
