export {
  type LLMProvider,
  type ModelDefinition,
  type ModelTier,
  type CostTier,
  MODEL_REGISTRY,
  getModelDef,
  resolveFromTier,
  resolveCheapModelFor,
  resolveQuickAssistModelFor,
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
  resolveRouteWithLocalFallback,
  toOpenRouterModelId,
} from "./client-factory";

export {
  type AgentRole,
  type ResolutionSource,
  type ResolvedModel,
  type BookModelSettings,
  type ConductorUserModelSettings,
  type ConductorWorkflow,
  AGENT_ROLES,
  ROLE_TO_BOOK_FIELD,
  ROLE_TO_USER_FIELD,
  BOOK_MODEL_SELECT,
  USER_MODEL_SELECT,
  bookModelSettingsOf,
  userModelSettingsOf,
  globalOverridesOf,
  resolveModelForRole,
  resolveConductorModel,
  resolveConductorModelForWorkflow,
  meetsMinimumTier,
  mapAgentTypeToRole,
  agentTypeToRole,
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

export {
  FALLBACK_DEFAULT_MODEL_ID,
  getDefaultModelId,
  isLocalFallbackEnabled,
  isLocalFleetConfigured,
} from "./defaults";
