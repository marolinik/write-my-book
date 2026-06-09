import Anthropic from "@anthropic-ai/sdk";
import { getAgentDefinition } from "./definitions";
import { assembleAgentPrompt } from "./prompt-assembler";
import {
  getToolDefinitions,
  executeTool,
  APPROVAL_SENTINEL,
  type ToolContext,
} from "./tools";
import { DocumentService } from "@/lib/documents/document-service";
import { estimateCost } from "@/lib/cost";
import {
  withProviderRetry,
  ProviderError,
  RETRY_CONFIG,
  type ProviderKey,
  translateProviderError,
} from "@/lib/llm";
import type {
  AgentResult,
  AgentStreamMessage,
  AgentSpawnOptions,
  ApprovalResponse,
} from "./types";

const MAX_TOOL_TURNS = 50;
const DEFAULT_MAX_RUNTIME_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_MAX_SESSION_COST_USD = 10;
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export interface OrchestratorOptions {
  /** Pre-built Anthropic SDK client (configured for the correct provider). */
  client: Anthropic;
  /** Full API model ID to send in requests (e.g. "claude-sonnet-4-5-20250929"). */
  modelId: string;
  /** Registry model ID for cost estimation (e.g. "anthropic/sonnet"). */
  registryId: string;
  maxRuntimeMs?: number;
  maxSessionCostUsd?: number;
  /** Shared cost tracker for Coach + specialist delegation. */
  sharedCostTracker?: import("./types").SharedCostTracker;
  /** Delegation context for the DelegateToSpecialist tool. */
  delegationContext?: import("./types").DelegationContext;
  /** Provider key for error translation and retry logic. */
  providerKey?: ProviderKey;
  /**
   * Custom approval resolver for background sessions.
   * When provided, approval gates use this instead of in-memory Promises.
   * The resolver should write pending state to Redis and poll for resolution.
   */
  approvalResolver?: (
    approvalId: string,
    deadline: number,
  ) => Promise<ApprovalResponse>;
}

/** Language-aware "begin" messages so the first user turn doesn't prime English. */
const LANG_BEGIN_MESSAGES: Record<string, string> = {
  en: "Please begin your work. Use the available tools to read project context and produce your output.",
  sr: "Molim te, počni sa radom. Koristi dostupne alate da pročitaš kontekst projekta i kreiraš svoj rezultat. Piši na srpskom, latinica.",
  de: "Bitte beginne mit der Arbeit. Nutze die verfügbaren Werkzeuge, um den Projektkontext zu lesen und dein Ergebnis zu erstellen. Schreibe auf Deutsch.",
  es: "Por favor, comienza tu trabajo. Usa las herramientas disponibles para leer el contexto del proyecto y producir tu resultado. Escribe en español.",
  fr: "Veuillez commencer votre travail. Utilisez les outils disponibles pour lire le contexte du projet et produire votre résultat. Écrivez en français.",
  ru: "Пожалуйста, начните работу. Используйте доступные инструменты для чтения контекста проекта и создания результата. Пишите на русском языке.",
  zh: "请开始工作。使用可用工具阅读项目上下文并生成结果。请用中文撰写。",
};

/**
 * Core orchestrator that spawns and manages agent sessions.
 * Implements an agentic tool-use loop: send messages -> stream response ->
 * if tool_use, execute tools, append results, loop back.
 */
export class AgentOrchestrator {
  private client: Anthropic;
  private resolvedModelId: string;
  private registryId: string;
  private abortController: AbortController | null = null;
  private pendingApprovals = new Map<
    string,
    (response: ApprovalResponse) => void
  >();
  private maxRuntimeMs: number;
  private maxSessionCostUsd: number;
  private runtimeTimeout: ReturnType<typeof setTimeout> | null = null;
  private sharedCostTracker: import("./types").SharedCostTracker | null = null;
  private delegationContext: import("./types").DelegationContext | null = null;
  private providerKey: ProviderKey;
  private approvalResolver: ((approvalId: string, deadline: number) => Promise<ApprovalResponse>) | null;

  constructor(options: OrchestratorOptions) {
    this.client = options.client;
    this.resolvedModelId = options.modelId;
    this.registryId = options.registryId;
    this.maxRuntimeMs = options.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS;
    this.maxSessionCostUsd = options.maxSessionCostUsd ?? DEFAULT_MAX_SESSION_COST_USD;
    this.sharedCostTracker = options.sharedCostTracker ?? null;
    this.delegationContext = options.delegationContext ?? null;
    this.providerKey = options.providerKey ?? "anthropic";
    this.approvalResolver = options.approvalResolver ?? null;
  }

  /** Get the delegation context for tool executors. */
  getDelegationContext(): import("./types").DelegationContext | null {
    return this.delegationContext;
  }

  /**
   * Run an agent action with a full tool-use loop.
   */
  async runAgent(options: AgentSpawnOptions): Promise<AgentResult> {
    const definition = getAgentDefinition(options.agentType);
    if (!definition) {
      throw new Error(`Unknown agent type: ${options.agentType}`);
    }

    this.abortController = new AbortController();

    // Wall-clock timeout
    this.runtimeTimeout = setTimeout(() => {
      options.onMessage({
        type: "error",
        content: `Session timed out after ${Math.round(this.maxRuntimeMs / 60000)} minutes.`,
      });
      this.cancel();
    }, this.maxRuntimeMs);

    const docService = new DocumentService(
      options.context.userId,
      options.context.bookId
    );

    const systemPrompt = await assembleAgentPrompt(
      definition,
      options.context,
      docService
    );
    const modelId = this.resolvedModelId;
    const tools = getToolDefinitions(definition.tools).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    // Create series DocumentService if series context is available
    const seriesDocService = options.context.seriesId
      ? new DocumentService(
          options.context.userId,
          undefined,
          options.context.seriesId
        )
      : undefined;

    const toolCtx: ToolContext = {
      bookId: options.context.bookId,
      userId: options.context.userId,
      sessionId: options.sessionId,
      agentType: options.agentType,
      documentService: docService,
      seriesId: options.context.seriesId,
      seriesDocumentService: seriesDocService,
      chapterNumber: options.context.chapterNumber,
      delegationContext: this.delegationContext ?? undefined,
    };

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: this.buildUserMessage(options),
      },
    ];

    const documentIds: string[] = [];

    try {
      const result = await this.runToolLoop(
        modelId,
        systemPrompt,
        messages,
        tools as Anthropic.Tool[],
        toolCtx,
        options,
        documentIds
      );

      const agentResult: AgentResult = {
        success: true,
        tokensInput: result.inputTokens,
        tokensOutput: result.outputTokens,
        documentIds,
        sessionId: options.sessionId,
      };

      await options.onComplete(agentResult);
      return agentResult;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await options.onError(err);
      return {
        success: false,
        tokensInput: 0,
        tokensOutput: 0,
        documentIds,
        sessionId: options.sessionId,
      };
    } finally {
      if (this.runtimeTimeout) {
        clearTimeout(this.runtimeTimeout);
        this.runtimeTimeout = null;
      }
    }
  }

  /**
   * Continue a conversation with additional user input.
   * For conversational workflows (coach, discuss-chapter, etc).
   */
  async continueConversation(
    options: AgentSpawnOptions,
    existingMessages: Anthropic.MessageParam[],
    userMessage: string
  ): Promise<void> {
    const definition = getAgentDefinition(options.agentType);
    if (!definition) {
      throw new Error(`Unknown agent type: ${options.agentType}`);
    }

    this.abortController = new AbortController();

    // Wall-clock timeout
    this.runtimeTimeout = setTimeout(() => {
      options.onMessage({
        type: "error",
        content: `Session timed out after ${Math.round(this.maxRuntimeMs / 60000)} minutes.`,
      });
      this.cancel();
    }, this.maxRuntimeMs);

    const docService = new DocumentService(
      options.context.userId,
      options.context.bookId
    );

    const systemPrompt = await assembleAgentPrompt(
      definition,
      options.context,
      docService
    );
    const modelId = this.resolvedModelId;
    const tools = getToolDefinitions(definition.tools).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    // Create series DocumentService if series context is available
    const seriesDocService2 = options.context.seriesId
      ? new DocumentService(
          options.context.userId,
          undefined,
          options.context.seriesId
        )
      : undefined;

    const toolCtx: ToolContext = {
      bookId: options.context.bookId,
      userId: options.context.userId,
      sessionId: options.sessionId,
      agentType: options.agentType,
      documentService: docService,
      seriesId: options.context.seriesId,
      seriesDocumentService: seriesDocService2,
      chapterNumber: options.context.chapterNumber,
      delegationContext: this.delegationContext ?? undefined,
    };

    // Add the new user message to existing conversation
    existingMessages.push({ role: "user", content: userMessage });

    const documentIds: string[] = [];

    try {
      const result = await this.runToolLoop(
        modelId,
        systemPrompt,
        existingMessages,
        tools as Anthropic.Tool[],
        toolCtx,
        options,
        documentIds
      );

      await options.onComplete({
        success: true,
        tokensInput: result.inputTokens,
        tokensOutput: result.outputTokens,
        documentIds,
        sessionId: options.sessionId,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await options.onError(err);
    } finally {
      if (this.runtimeTimeout) {
        clearTimeout(this.runtimeTimeout);
        this.runtimeTimeout = null;
      }
    }
  }

  cancel(): void {
    this.abortController?.abort();
    for (const [, resolver] of this.pendingApprovals) {
      resolver({ decision: "reject", message: "Session cancelled" });
    }
    this.pendingApprovals.clear();
  }

  /** Resolve a pending approval gate. */
  resolveApproval(approvalId: string, response: ApprovalResponse): boolean {
    const resolver = this.pendingApprovals.get(approvalId);
    if (!resolver) return false;
    resolver(response);
    this.pendingApprovals.delete(approvalId);
    return true;
  }

  /**
   * Shared tool-use loop.
   */
  private async runToolLoop(
    modelId: string,
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    toolCtx: ToolContext,
    options: AgentSpawnOptions,
    documentIds: string[]
  ): Promise<{ inputTokens: number; outputTokens: number }> {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      if (this.abortController?.signal.aborted) break;

      // Context trimming disabled — full tool results are preserved across turns.
      // this.trimOldToolResults(messages);

      let finalMessage: Anthropic.Message;
      try {
        finalMessage = await withProviderRetry(
          async () => {
            const stream = this.client.messages.stream({
              model: modelId,
              max_tokens: 64000,
              system: systemPrompt,
              messages,
              ...(tools.length > 0 ? { tools } : {}),
            });

            // Stream events to SSE listeners
            for await (const event of stream) {
              if (this.abortController?.signal.aborted) break;

              if (event.type === "content_block_start") {
                if (event.content_block.type === "tool_use") {
                  options.onMessage({
                    type: "tool_use",
                    content: `Using tool: ${event.content_block.name}`,
                    metadata: {
                      tool: event.content_block.name,
                      toolUseId: event.content_block.id,
                    },
                  });
                }
              } else if (event.type === "content_block_delta") {
                const delta = event.delta;
                if ("text" in delta && delta.text) {
                  options.onMessage({ type: "text", content: delta.text });
                }
              }
            }

            return stream.finalMessage();
          },
          {
            provider: this.providerKey,
            onRetry: (attempt, waitMs, error) => {
              options.onMessage({
                type: "status",
                content: `${error.userMessage} Retrying in ${waitMs / 1000}s... (attempt ${attempt}/${RETRY_CONFIG.maxRetries})`,
              });
            },
          }
        );
      } catch (error) {
        // Non-retryable or exhausted retries — emit translated error
        if (error instanceof ProviderError) {
          options.onMessage({
            type: "error",
            content: error.translated.userMessage,
            metadata: {
              action: error.translated.action,
              ...(error.translated.action === "check-key" ? { switchable: true } : {}),
            },
          });
        } else {
          const translated = translateProviderError(500, this.providerKey);
          options.onMessage({
            type: "error",
            content: translated.userMessage,
          });
        }
        break;
      }

      totalInputTokens += finalMessage.usage.input_tokens;
      totalOutputTokens += finalMessage.usage.output_tokens;

      // Update shared cost tracker (used for Coach + specialist budget sharing)
      if (this.sharedCostTracker) {
        this.sharedCostTracker.totalInputTokens += finalMessage.usage.input_tokens;
        this.sharedCostTracker.totalOutputTokens += finalMessage.usage.output_tokens;
      }

      // Emit live cost update SSE event
      const runningCost = estimateCost(this.registryId, totalInputTokens, totalOutputTokens);
      options.onMessage({
        type: "cost_update",
        content: `$${runningCost.toFixed(4)}`,
        metadata: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: runningCost,
          model: this.registryId,
        },
      });

      // Cost budget check — estimate running cost and break if over limit
      if (runningCost > this.maxSessionCostUsd) {
        options.onMessage({
          type: "error",
          content: `Session cost limit reached ($${runningCost.toFixed(2)}/$${this.maxSessionCostUsd.toFixed(2)}). Stopping to prevent overspend.`,
        });
        break;
      }

      // Handle max_tokens BEFORE pushing assistant message — when truncation
      // happens mid-tool-use, the tool_use block has incomplete JSON input.
      // The API requires a tool_result for every tool_use, so we must handle
      // this specially: strip broken tool_use blocks, provide error results
      // for any that exist, and ask the model to retry.
      if (finalMessage.stop_reason === "max_tokens") {
        const contentBlocks = finalMessage.content;
        const toolUseBlocks = contentBlocks.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );
        if (toolUseBlocks.length > 0) {
          // Tool call was truncated — the input JSON is likely incomplete.
          // Push the full assistant content (including the truncated tool_use
          // blocks) so tool_use IDs exist for the tool_result references.
          // Then provide error tool_results telling the model to retry.
          messages.push({ role: "assistant", content: contentBlocks });

          // Send tool_result SSE messages so the UI clears tool spinners
          // (the streaming phase already sent tool_use SSE for these IDs)
          for (const tu of toolUseBlocks) {
            options.onMessage({
              type: "tool_result",
              content: "Tool call truncated — retrying...",
              metadata: { tool: tu.name, toolUseId: tu.id },
            });
          }

          const errorResults: Anthropic.ToolResultBlockParam[] =
            toolUseBlocks.map((tu) => ({
              type: "tool_result" as const,
              tool_use_id: tu.id,
              content:
                "ERROR: Your tool call was truncated because the response exceeded the maximum length. " +
                "The tool did NOT execute. You MUST call the tool again. " +
                "If writing a large document, break it into sections and use multiple smaller WriteDocument calls.",
              is_error: true,
            }));
          messages.push({ role: "user", content: errorResults });
        } else {
          // Pure text truncation — push content and ask to continue
          messages.push({ role: "assistant", content: contentBlocks });
          messages.push({
            role: "user",
            content:
              "Your previous response was cut off because it exceeded the length limit. " +
              "Please continue exactly where you left off. Do not repeat what you already wrote. " +
              "IMPORTANT: Continue in the SAME language you were writing in.",
          });
        }
        continue;
      }

      messages.push({ role: "assistant", content: finalMessage.content });

      if (finalMessage.stop_reason === "end_turn") break;

      if (finalMessage.stop_reason === "tool_use") {
        const toolUseBlocks = finalMessage.content.filter(
          (block): block is Anthropic.ToolUseBlock =>
            block.type === "tool_use"
        );

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          options.onMessage({
            type: "tool_use",
            content: `Executing: ${toolUse.name}`,
            metadata: {
              tool: toolUse.name,
              toolInput: toolUse.input as Record<string, unknown>,
              toolUseId: toolUse.id,
            },
          });

          const result = await executeTool(
            toolUse.name,
            toolCtx,
            toolUse.input as Record<string, unknown>
          );

          // Handle approval gate
          if (result === APPROVAL_SENTINEL) {
            const approvalInput = toolUse.input as {
              title?: string;
              description?: string;
            };
            const approvalId = crypto.randomUUID();

            const approvalDeadline = Date.now() + APPROVAL_TIMEOUT_MS;

            options.onMessage({
              type: "approval_request",
              content: approvalInput.description ?? "Approval requested",
              metadata: {
                tool: "RequestApproval",
                toolUseId: toolUse.id,
                approvalId,
                approvalTitle: approvalInput.title,
                approvalDeadline,
              },
            });

            // Wait for user response — Redis polling (background) or in-memory Promise (inline)
            const approvalResponse = this.approvalResolver
              ? await this.approvalResolver(approvalId, approvalDeadline)
              : await new Promise<ApprovalResponse>(
                  (resolve) => {
                    this.pendingApprovals.set(approvalId, resolve);

                    setTimeout(() => {
                      if (this.pendingApprovals.has(approvalId)) {
                        this.pendingApprovals.delete(approvalId);
                        resolve({
                          decision: "reject",
                          message: "Approval timed out after 10 minutes",
                        });
                      }
                    }, APPROVAL_TIMEOUT_MS);

                    this.abortController?.signal.addEventListener("abort", () => {
                      if (this.pendingApprovals.has(approvalId)) {
                        this.pendingApprovals.delete(approvalId);
                        resolve({
                          decision: "reject",
                          message: "Session cancelled",
                        });
                      }
                    });
                  }
                );

            const approvalText =
              approvalResponse.decision === "approve"
                ? `APPROVED${approvalResponse.message ? `: ${approvalResponse.message}` : ""}`
                : approvalResponse.decision === "modify"
                  ? `MODIFY: ${approvalResponse.message ?? "Please adjust your approach"}`
                  : `REJECTED${approvalResponse.message ? `: ${approvalResponse.message}` : ""}`;

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: `Writer response: ${approvalText}`,
            });

            options.onMessage({
              type: "tool_result",
              content: `Writer: ${approvalText}`,
              metadata: {
                tool: "RequestApproval",
                toolUseId: toolUse.id,
                approvalDecision: approvalResponse.decision,
              },
            });

            continue;
          }

          // Regular tool result
          const truncatedResult =
            result.length > 50000
              ? result.slice(0, 50000) + "\n... (truncated)"
              : result;

          options.onMessage({
            type: "tool_result",
            content:
              truncatedResult.length > 500
                ? truncatedResult.slice(0, 500) + "..."
                : truncatedResult,
            metadata: { tool: toolUse.name, toolUseId: toolUse.id },
          });

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: truncatedResult,
          });
        }

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      // Any other stop reason — stop
      break;
    }

    return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
  }

  /**
   * Trim tool_result content from all messages except the last user message.
   * After the model has processed a tool result (i.e., responded to it), the full
   * content is no longer needed — a short marker preserves conversation structure.
   * This prevents context overflow when agents read many large documents.
   */
  private trimOldToolResults(messages: Anthropic.MessageParam[]): void {
    // Only trim if there are enough messages (at least: user, assistant, user)
    if (messages.length < 3) return;

    // Estimate rough token count: ~4 chars per token
    let estimatedChars = 0;
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        estimatedChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if ("text" in block && typeof block.text === "string") {
            estimatedChars += block.text.length;
          } else if ("content" in block && typeof block.content === "string") {
            estimatedChars += block.content.length;
          }
        }
      }
    }

    // Only trim if approaching the limit (~150K tokens ≈ 600K chars)
    if (estimatedChars < 500_000) return;

    const TRIM_MARKER = "[Content processed — trimmed to save context space]";

    // Trim all user messages EXCEPT the last one (which may contain fresh tool results)
    for (let i = 0; i < messages.length - 1; i++) {
      const msg = messages[i];
      if (msg.role !== "user" || !Array.isArray(msg.content)) continue;

      for (let j = 0; j < msg.content.length; j++) {
        const block = msg.content[j];
        if (
          block.type === "tool_result" &&
          typeof block.content === "string" &&
          block.content.length > 200
        ) {
          (block as Anthropic.ToolResultBlockParam).content = TRIM_MARKER;
        }
      }
    }
  }

  private buildUserMessage(options: AgentSpawnOptions): string {
    const parts: string[] = [];

    parts.push(`Workflow: ${options.workflowId}`);

    if (options.context.bookName) {
      parts.push(`Book: ${options.context.bookName}`);
    }

    if (options.context.chapterNumber) {
      parts.push(`Chapter: ${options.context.chapterNumber}`);
    }

    // Include user's initial message if provided (from floating input, context menu, etc.)
    if (options.context.userMessage) {
      parts.push(`\nUser's request: ${options.context.userMessage}`);
    }

    // Use a language-aware instruction so the model doesn't default to English
    const lang = options.context.language;
    const beginMsg = LANG_BEGIN_MESSAGES[lang ?? "en"] ?? LANG_BEGIN_MESSAGES.en;
    parts.push(beginMsg);

    return parts.join("\n");
  }
}
