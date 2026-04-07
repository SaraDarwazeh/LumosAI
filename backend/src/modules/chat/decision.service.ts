import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from './llm.service';
import { ChatAction, DecisionContext, DecisionResult } from './chat.types';

const DECISION_ACTIONS = new Set<string>(Object.values(ChatAction));

@Injectable()
export class DecisionService {
  private readonly logger = new Logger(DecisionService.name);

  constructor(private readonly llmService: LlmService) {}

  async decide(context: DecisionContext): Promise<DecisionResult> {
    const normalizedMessage = context.userMessage.toLowerCase().trim();
    const fastPathDecision = this.evaluateFastPath(normalizedMessage);

    if (fastPathDecision) {
      return fastPathDecision;
    }

    const modelInvocation = await this.llmService.chooseAction({
      userMessage: context.userMessage,
      conversationSummary: context.conversationSummary,
      recentMessages: context.recentMessages,
      memory: context.memory,
    });

    const parsedDecision = this.parseModelDecision(modelInvocation.content);
    if (parsedDecision) {
      return parsedDecision;
    }

    return {
      action: ChatAction.DIRECT_ANSWER,
      reason: 'Fell back to direct answer because the decision response was unavailable or invalid.',
      source: 'fallback',
    };
  }

  private evaluateFastPath(message: string): DecisionResult | null {
    if (this.looksLikeToolRequest(message)) {
      return {
        action: ChatAction.USE_TOOL,
        reason: 'The request matches a task management or CRUD operation request.',
        source: 'rule',
      };
    }

    if (this.looksLikeMemoryStorage(message)) {
      return {
        action: ChatAction.STORE_MEMORY,
        reason: 'The message includes an explicit long-term memory phrase.',
        source: 'rule',
      };
    }

    return null;
  }

  private parseModelDecision(rawDecision: string | null): DecisionResult | null {
    if (!rawDecision) {
      return null;
    }

    try {
      const candidate = this.extractJsonObject(rawDecision);
      const parsedDecision = JSON.parse(candidate) as {
        action?: string;
        reason?: unknown;
      };

      if (!parsedDecision.action || !DECISION_ACTIONS.has(parsedDecision.action)) {
        this.logger.warn(`Decision model returned invalid action: ${rawDecision}`);
        return null;
      }

      return {
        action: parsedDecision.action as ChatAction,
        reason:
          typeof parsedDecision.reason === 'string' && parsedDecision.reason.trim().length > 0
            ? parsedDecision.reason.trim()
            : 'Decision selected by model.',
        source: 'llm',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to parse decision model output: ${message}`);
      return null;
    }
  }

  private extractJsonObject(rawDecision: string) {
    const fencedJsonMatch = rawDecision.match(/```json\s*([\s\S]*?)\s*```/i);
    if (fencedJsonMatch?.[1]) {
      return fencedJsonMatch[1].trim();
    }

    const firstBraceIndex = rawDecision.indexOf('{');
    const lastBraceIndex = rawDecision.lastIndexOf('}');

    if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
      return rawDecision.slice(firstBraceIndex, lastBraceIndex + 1);
    }

    return rawDecision;
  }

  private looksLikeToolRequest(message: string) {
    // Calendar / scheduling operations
    if (/\b(schedule|book|set up|plan|arrange)\b.*(meeting|appointment|call|event|session)/.test(message)) {
      return true;
    }
    if (/\b(create|add|new)\b.*(event|meeting|appointment|calendar)/.test(message)) {
      return true;
    }
    if (/\b(remind me|set a reminder|schedule a reminder)/.test(message)) {
      return true;
    }

    // Email operations
    if (/\b(send|write|compose|draft)\b.*(email|mail|message)/.test(message)) {
      return true;
    }

    // Task operations
    if (this.matchesPattern(message, ['add task', 'create task', 'new task', 'add a task'])) {
      return true;
    }
    if (
      this.matchesPattern(message, [
        'show tasks',
        'list tasks',
        'get tasks',
        'what are my tasks',
        'tasks',
      ])
    ) {
      return true;
    }
    if (this.matchesPattern(message, ['update task', 'edit task', 'change task', 'mark task'])) {
      return true;
    }
    if (this.matchesPattern(message, ['delete task', 'remove task', 'done with task'])) {
      return true;
    }

    // Note operations
    if (this.matchesPattern(message, ['add note', 'create note', 'new note', 'make a note'])) {
      return true;
    }
    if (
      this.matchesPattern(message, [
        'show notes',
        'list notes',
        'get notes',
        'what are my notes',
        'notes',
      ])
    ) {
      return true;
    }
    if (this.matchesPattern(message, ['update note', 'edit note', 'change note'])) {
      return true;
    }
    if (this.matchesPattern(message, ['delete note', 'remove note'])) {
      return true;
    }

    // Idea operations
    if (this.matchesPattern(message, ['add idea', 'create idea', 'new idea', 'have an idea'])) {
      return true;
    }
    if (
      this.matchesPattern(message, [
        'show ideas',
        'list ideas',
        'get ideas',
        'what are my ideas',
        'ideas',
      ])
    ) {
      return true;
    }
    if (this.matchesPattern(message, ['update idea', 'edit idea', 'change idea'])) {
      return true;
    }
    if (this.matchesPattern(message, ['delete idea', 'remove idea'])) {
      return true;
    }

    // Generic math
    if (/(calculate|compute|what is|solve)\b/.test(message)) {
      return true;
    }

    return /^[0-9\s+\-*/().]+$/.test(message);
  }

  private matchesPattern(message: string, patterns: string[]): boolean {
    const msg = message.toLowerCase();
    return patterns.some((pattern) => {
      // Convert pattern to regex with word boundaries for more flexible matching
      const regex = new RegExp(
        pattern
          .split(/\s+/)
          .map(word => `\\b${word}\\b`)
          .join('.*?'),
        'i'
      );
      return regex.test(msg);
    });
  }

  private looksLikeMemoryStorage(message: string) {
    // Explicit save commands always win
    if (/^(save this|remember this)/i.test(message.trim())) {
      return true;
    }
    return /(remember that|please remember|my name is|i prefer|i like|my favorite|i work at|i live in)/.test(
      message,
    );
  }
}
