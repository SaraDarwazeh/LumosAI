import { Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import { MemoryClient, MemorySearchResult } from '../../clients/memory.client';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { ContextService } from './context.service';
import { DecisionService } from './decision.service';
import { LlmService } from './llm.service';
import { MemoryPolicyService } from './memory-policy.service';
import { PlannerService } from './planner.service';
import { ToolDispatcherService } from './tool-dispatcher.service';
import {
  ChatAction,
  DecisionResult,
  ExecutionStep,
  MemoryPolicyDecision,
  PlanStep,
} from './chat.types';
import { ToolService } from './tool.service';

const MAX_MESSAGE_LENGTH = 4000;

interface ChatOptions {
  debug?: boolean;
  firebaseToken?: string | null;
}

interface ChatExecutionContext {
  summary: string | null;
  conversation: Awaited<ReturnType<ContextService['buildContext']>>['conversation'];
  memory: Awaited<ReturnType<ContextService['buildContext']>>['memory'];
  user_id: string;
}

interface ActionRuntimeState {
  toolUsed?: string;
  toolOutput?: string;
  memoryPolicy?: MemoryPolicyDecision;
  memoryForResponse: MemorySearchResult[];
  llmPrompt?: string | null;
  llmDurationMs: number;
}

interface ActionExecutionResult extends ActionRuntimeState {
  response: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
    private readonly contextService: ContextService,
    private readonly memoryClient: MemoryClient,
    private readonly decisionService: DecisionService,
    private readonly llmService: LlmService,
    private readonly toolService: ToolService,
    private readonly toolDispatcherService: ToolDispatcherService,
    private readonly plannerService: PlannerService,
    private readonly memoryPolicyService: MemoryPolicyService,
  ) {}

  async chat(userId: string, createChatDto: CreateChatDto, options: ChatOptions = {}) {
    const totalStartedAt = performance.now();
    const executionSteps: ExecutionStep[] = [];

    await this.applyRateLimitHook(userId);
    this.ensureMessageWithinLimit(createChatDto.message);

    await this.conversationsService.findConversationByIdOrThrow(
      userId,
      createChatDto.conversation_id,
    );

    const userMessage = await this.messagesService.createMessage(
      userId,
      createChatDto.conversation_id,
      MessageRole.user,
      createChatDto.message,
    );

    const conversationHistory = await this.messagesService.findRecentByConversation(
      userId,
      createChatDto.conversation_id,
      5,
    );

    const rawMemoryResults = await this.memoryClient.searchMemory({
      query: createChatDto.message,
      top_k: 5,
      user_id: userId,
    });

    const context = this.contextService.buildContext({
      userId,
      conversation: conversationHistory,
      memory: rawMemoryResults,
    });

    const memoryFiltered = this.getFilteredMemory(rawMemoryResults, context.memory);
    executionSteps.push({
      name: 'memory_usage',
      status: 'completed',
      details: {
        raw_count: rawMemoryResults.length,
        used_count: context.memory.length,
        filtered_count: memoryFiltered.length,
      },
    });

    const decisionStartedAt = performance.now();
    const decision = await this.decisionService.decide({
      userMessage: createChatDto.message,
      conversationSummary: context.summary,
      recentMessages: context.conversation,
      memory: context.memory,
    });
    const decisionMs = performance.now() - decisionStartedAt;
    executionSteps.push({
      name: 'decision',
      status: 'completed',
      duration_ms: Number(decisionMs.toFixed(2)),
      details: {
        action: decision.action,
        reason: decision.reason,
        source: decision.source,
      },
    });

    const planningStartedAt = performance.now();
    const plan = this.plannerService.createPlan(createChatDto.message, decision);
    const planningMs = performance.now() - planningStartedAt;
    executionSteps.push({
      name: 'planning',
      status: plan ? 'completed' : 'skipped',
      duration_ms: Number(planningMs.toFixed(2)),
      details: {
        step_count: plan?.length ?? 0,
      },
    });

    const executionResult = plan
      ? await this.executePlan(
          userId,
          createChatDto.conversation_id,
          userMessage.id,
          createChatDto.message,
          context,
          decision,
          plan,
          executionSteps,
          options.firebaseToken,
        )
      : await this.executeAction(
          userId,
          createChatDto.conversation_id,
          userMessage.id,
          createChatDto.message,
          context,
          decision.action,
          executionSteps,
          undefined,
          true,
          options.firebaseToken,
        );

    const assistantMessage = await this.messagesService.createMessage(
      userId,
      createChatDto.conversation_id,
      MessageRole.assistant,
      executionResult.response,
    );

    const totalMs = performance.now() - totalStartedAt;

    const response = {
      conversation_id: createChatDto.conversation_id,
      user_message: userMessage,
      assistant_message: assistantMessage,
      response: executionResult.response,
      decision,
      plan,
      memory_policy: executionResult.memoryPolicy,
      context,
    };

    if (!options.debug) {
      return response;
    }

    return {
      ...response,
      memory_used: context.memory,
      memory_filtered: memoryFiltered,
      tool_used: executionResult.toolUsed ?? null,
      tool_output: executionResult.toolOutput ?? null,
      prompt: executionResult.llmPrompt ?? null,
      execution_steps: executionSteps,
      timing: {
        decision_ms: Number(decisionMs.toFixed(2)),
        llm_ms: Number(executionResult.llmDurationMs.toFixed(2)),
        total_ms: Number(totalMs.toFixed(2)),
      },
    };
  }

  private async executePlan(
    userId: string,
    conversationId: string,
    messageId: string,
    userMessage: string,
    context: ChatExecutionContext,
    decision: DecisionResult,
    plan: PlanStep[],
    executionSteps: ExecutionStep[],
    firebaseToken?: string | null,
  ): Promise<ActionExecutionResult> {
    const runtimeState: ActionRuntimeState = {
      memoryForResponse: [],
      llmDurationMs: 0,
    };
    let response: string | null = null;

    for (const planStep of plan) {
      const stepResult = await this.executeAction(
        userId,
        conversationId,
        messageId,
        userMessage,
        context,
        planStep.action,
        executionSteps,
        runtimeState,
        planStep.step === plan.length,
        firebaseToken,
      );

      runtimeState.toolUsed = stepResult.toolUsed ?? runtimeState.toolUsed;
      runtimeState.toolOutput = stepResult.toolOutput ?? runtimeState.toolOutput;
      runtimeState.memoryPolicy = stepResult.memoryPolicy ?? runtimeState.memoryPolicy;
      runtimeState.memoryForResponse = stepResult.memoryForResponse;
      runtimeState.llmPrompt = stepResult.llmPrompt ?? runtimeState.llmPrompt;
      runtimeState.llmDurationMs += stepResult.llmDurationMs;

      if (stepResult.response) {
        response = stepResult.response;
      }
    }

    if (!response) {
      const finalLlm = await this.llmService.generateResponse({
        action: decision.action,
        userMessage,
        conversationSummary: context.summary,
        recentMessages: context.conversation,
        memory:
          runtimeState.memoryForResponse.length > 0
            ? runtimeState.memoryForResponse
            : decision.action === ChatAction.USE_MEMORY
              ? context.memory
              : [],
        toolOutput: runtimeState.toolOutput,
      });

      runtimeState.llmDurationMs += finalLlm.durationMs;
      runtimeState.llmPrompt = finalLlm.prompt;
      response =
        finalLlm.content ??
        runtimeState.toolOutput ??
        `I received your message and I'm ready to help: ${userMessage}`;

      executionSteps.push({
        name: 'llm_response',
        status: 'completed',
        duration_ms: Number(finalLlm.durationMs.toFixed(2)),
        details: {
          mode: decision.action,
          used_memory_count:
            runtimeState.memoryForResponse.length > 0
              ? runtimeState.memoryForResponse.length
              : decision.action === ChatAction.USE_MEMORY
                ? context.memory.length
                : 0,
          prompt_preview: finalLlm.prompt,
        },
      });
    }

    return {
      response,
      ...runtimeState,
    };
  }

  private async executeAction(
    userId: string,
    conversationId: string,
    messageId: string,
    userMessage: string,
    context: ChatExecutionContext,
    action: ChatAction,
    executionSteps: ExecutionStep[],
    runtimeState?: ActionRuntimeState,
    shouldRespond = true,
    firebaseToken?: string | null,
  ): Promise<ActionExecutionResult> {
    const state: ActionRuntimeState = runtimeState ?? {
      memoryForResponse: [],
      llmDurationMs: 0,
    };

    switch (action) {
      case ChatAction.USE_TOOL: {
        const startedAt = performance.now();
        this.logger.debug('USER requested tool execution', { userId, userMessage });

        // Parse tool request from user message
        const toolRequest = await this.toolDispatcherService.parseToolRequest(userMessage);
        if (!toolRequest) {
          executionSteps.push({
            name: 'tool_execution',
            status: 'failed',
            duration_ms: 0,
            details: {
              error: 'Could not parse tool request from user message',
            },
          });
          
          return {
            response: 'I could not understand what tool operation you want to perform. Please be more specific with your request.',
            toolUsed: state.toolUsed,
            toolOutput: state.toolOutput,
            memoryPolicy: state.memoryPolicy,
            memoryForResponse: state.memoryForResponse,
            llmPrompt: state.llmPrompt,
            llmDurationMs: 0,
          };
        }

        try {
          // Execute the tool via MCP
          const toolResult = await this.toolService.execute(
            userId,
            toolRequest.toolName,
            toolRequest.parameters,
            firebaseToken,
          );
          const durationMs = performance.now() - startedAt;
          this.logger.debug('Tool execution result', {
            tool: toolRequest.toolName,
            userId,
            outputPreview: toolResult.output.substring(0, 200),
          });

          executionSteps.push({
            name: 'tool_execution',
            status: 'completed',
            duration_ms: Number(durationMs.toFixed(2)),
            details: {
              tool: toolResult.tool,
              output_preview: toolResult.output.substring(0, 200),
            },
          });

          return {
            response: shouldRespond ? toolResult.output : '',
            toolUsed: toolResult.tool,
            toolOutput: toolResult.output,
            memoryPolicy: state.memoryPolicy,
            memoryForResponse: state.memoryForResponse,
            llmPrompt: state.llmPrompt,
            llmDurationMs: 0,
          };
        } catch (error) {
          const durationMs = performance.now() - startedAt;
          const errorMsg = error instanceof Error ? error.message : String(error);
          
          executionSteps.push({
            name: 'tool_execution',
            status: 'failed',
            duration_ms: Number(durationMs.toFixed(2)),
            details: {
              tool: toolRequest.toolName,
              error: errorMsg,
            },
          });
          
          return {
            response: `Tool execution failed: ${errorMsg}`,
            toolUsed: toolRequest.toolName,
            toolOutput: `Error: ${errorMsg}`,
            memoryPolicy: state.memoryPolicy,
            memoryForResponse: state.memoryForResponse,
            llmPrompt: state.llmPrompt,
            llmDurationMs: 0,
          };
        }
      }
      case ChatAction.STORE_MEMORY: {
        const existingMemory = [...context.memory, ...state.memoryForResponse]
          .map((memoryItem) => memoryItem.text)
          .filter((text): text is string => typeof text === 'string' && text.length > 0);

        const memoryPolicy = this.memoryPolicyService.evaluate(userMessage, existingMemory);

        if (memoryPolicy.shouldStore) {
          void this.memoryClient.indexMemory({
            id: messageId,
            text: userMessage,
            type: 'note',
            metadata: {
              user_id: userId,
              source: 'chat',
              timestamp: new Date().toISOString(),
              importance: memoryPolicy.importance,
              confidence: memoryPolicy.confidence,
              memory_type: memoryPolicy.memoryType,
              conversation_id: conversationId,
            },
          });
        }

        executionSteps.push({
          name: 'memory_write',
          status: memoryPolicy.shouldStore ? 'completed' : 'skipped',
          details: {
            should_store: memoryPolicy.shouldStore,
            reason: memoryPolicy.reason,
            importance: memoryPolicy.importance,
            confidence: memoryPolicy.confidence,
            memory_type: memoryPolicy.memoryType,
          },
        });

        if (!shouldRespond) {
          return {
            response: '',
            toolUsed: state.toolUsed,
            toolOutput: state.toolOutput,
            memoryPolicy,
            memoryForResponse: state.memoryForResponse,
            llmPrompt: state.llmPrompt,
            llmDurationMs: 0,
          };
        }

        const llmResult = await this.llmService.generateResponse({
          action: memoryPolicy.shouldStore ? ChatAction.STORE_MEMORY : ChatAction.DIRECT_ANSWER,
          userMessage,
          conversationSummary: context.summary,
          recentMessages: context.conversation,
          memory: [],
          toolOutput: state.toolOutput,
        });

        executionSteps.push({
          name: 'llm_response',
          status: 'completed',
          duration_ms: Number(llmResult.durationMs.toFixed(2)),
          details: {
            mode: memoryPolicy.shouldStore ? ChatAction.STORE_MEMORY : ChatAction.DIRECT_ANSWER,
            used_memory_count: 0,
            prompt_preview: llmResult.prompt,
          },
        });

        return {
          response:
            llmResult.content ??
            `I'll remember that. For now, here's a response based on what you shared: ${userMessage}`,
          toolUsed: state.toolUsed,
          toolOutput: state.toolOutput,
          memoryPolicy,
          memoryForResponse: state.memoryForResponse,
          llmPrompt: llmResult.prompt,
          llmDurationMs: llmResult.durationMs,
        };
      }
      case ChatAction.USE_MEMORY: {
        executionSteps.push({
          name: 'memory_selection',
          status: 'completed',
          details: {
            used_count: context.memory.length,
          },
        });

        if (!shouldRespond) {
          return {
            response: '',
            toolUsed: state.toolUsed,
            toolOutput: state.toolOutput,
            memoryPolicy: state.memoryPolicy,
            memoryForResponse: context.memory,
            llmPrompt: state.llmPrompt,
            llmDurationMs: 0,
          };
        }

        const llmResult = await this.llmService.generateResponse({
          action,
          userMessage,
          conversationSummary: context.summary,
          recentMessages: context.conversation,
          memory: context.memory,
          toolOutput: state.toolOutput,
        });

        executionSteps.push({
          name: 'llm_response',
          status: 'completed',
          duration_ms: Number(llmResult.durationMs.toFixed(2)),
          details: {
            mode: ChatAction.USE_MEMORY,
            used_memory_count: context.memory.length,
            prompt_preview: llmResult.prompt,
          },
        });

        return {
          response:
            llmResult.content ??
            `Here is what seems most relevant from your history: ${context.memory[0]?.text ?? userMessage}`,
          toolUsed: state.toolUsed,
          toolOutput: state.toolOutput,
          memoryPolicy: state.memoryPolicy,
          memoryForResponse: context.memory,
          llmPrompt: llmResult.prompt,
          llmDurationMs: llmResult.durationMs,
        };
      }
      case ChatAction.DIRECT_ANSWER:
      default: {
        const memoryForResponse = state.memoryForResponse;
        const llmResult = await this.llmService.generateResponse({
          action: ChatAction.DIRECT_ANSWER,
          userMessage,
          conversationSummary: context.summary,
          recentMessages: context.conversation,
          memory: memoryForResponse,
          toolOutput: state.toolOutput,
        });

        executionSteps.push({
          name: 'llm_response',
          status: 'completed',
          duration_ms: Number(llmResult.durationMs.toFixed(2)),
          details: {
            mode: ChatAction.DIRECT_ANSWER,
            used_memory_count: memoryForResponse.length,
            prompt_preview: llmResult.prompt,
          },
        });

        return {
          response:
            llmResult.content ??
            `I received your message and I'm ready to help: ${userMessage}`,
          toolUsed: state.toolUsed,
          toolOutput: state.toolOutput,
          memoryPolicy: state.memoryPolicy,
          memoryForResponse,
          llmPrompt: llmResult.prompt,
          llmDurationMs: llmResult.durationMs,
        };
      }
    }
  }

  private getFilteredMemory(
    rawMemoryResults: MemorySearchResult[],
    usedMemoryResults: MemorySearchResult[],
  ) {
    const usedIds = new Set(usedMemoryResults.map((memoryItem) => memoryItem.id));
    return rawMemoryResults.filter((memoryItem) => !usedIds.has(memoryItem.id));
  }

  private ensureMessageWithinLimit(message: string) {
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new PayloadTooLargeException(
        `Chat messages must not exceed ${MAX_MESSAGE_LENGTH} characters.`,
      );
    }
  }

  private async applyRateLimitHook(_userId: string) {
    // Placeholder hook for future per-user rate limiting.
    return;
  }
}
