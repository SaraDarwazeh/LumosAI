import { Injectable, Logger } from '@nestjs/common';
import { Message } from '@prisma/client';
import { MemorySearchResult } from '../../clients/memory.client';
import { ChatAction, DecisionContext, LlmInvocationResult } from './chat.types';

interface GenerateResponseParams {
  action: ChatAction;
  userMessage: string;
  conversationSummary: string | null;
  recentMessages: Message[];
  memory: MemorySearchResult[];
  toolOutput?: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

interface OllamaGenerateResponse {
  response?: string;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly provider = (process.env.LLM_PROVIDER ?? 'openai').toLowerCase();
  private readonly openAiBaseUrl = (
    process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1'
  ).replace(/\/$/, '');
  private readonly openAiApiKey = process.env.LLM_API_KEY;
  private readonly openAiModel = process.env.LLM_MODEL ?? 'gpt-4o-mini';
  private readonly ollamaBaseUrl = (
    process.env.OLLAMA_BASE_URL ?? 'http://ollama:11434'
  ).replace(/\/$/, '');
  private readonly ollamaModel = process.env.OLLAMA_MODEL ?? 'gemma:2b';

  async chooseAction(context: DecisionContext): Promise<LlmInvocationResult> {
    const prompt = this.buildDecisionPrompt(context);

    if (this.provider === 'ollama') {
      return this.requestOllama(prompt);
    }

    if (!this.openAiApiKey) {
      return {
        content: null,
        prompt: this.truncatePrompt(prompt),
        durationMs: 0,
      };
    }

    return this.requestOpenAi(
      [
        {
          role: 'system',
          content: [
            'You are an orchestration classifier for an AI agent.',
            'Choose exactly one action for the next step.',
            'Available actions: DIRECT_ANSWER, USE_MEMORY, STORE_MEMORY, USE_TOOL.',
            'Return JSON only in this exact shape:',
            '{"action":"DIRECT_ANSWER","reason":"..."}',
            'Do not wrap the JSON in markdown.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `User message:\n${context.userMessage}`,
            '',
            `Conversation summary:\n${context.conversationSummary ?? 'None'}`,
            '',
            `Recent conversation:\n${this.formatConversationSection(context.recentMessages)}`,
            '',
            `Relevant memory:\n${this.formatMemorySection(context.memory)}`,
          ].join('\n'),
        },
      ],
      0,
    );
  }

  async generateResponse(params: GenerateResponseParams): Promise<LlmInvocationResult> {
    const prompt = this.buildResponsePrompt(params);

    if (this.provider === 'ollama') {
      const invocation = await this.requestOllama(prompt);
      return {
        ...invocation,
        content:
          invocation.content && invocation.content.length > 0
            ? invocation.content
            : this.generateFallbackResponse(params),
      };
    }

    if (!this.openAiApiKey) {
      const fallbackContent = this.generateFallbackResponse(params);
      return {
        content: fallbackContent,
        prompt: this.truncatePrompt(prompt),
        durationMs: 0,
      };
    }

    const invocation = await this.requestOpenAi(this.buildResponseMessages(params), 0.4);
    return {
      ...invocation,
      content:
        invocation.content && invocation.content.length > 0
          ? invocation.content
          : this.generateFallbackResponse(params),
    };
  }

  private async requestOpenAi(
    messages: Array<{ role: string; content: string }>,
    temperature: number,
  ): Promise<LlmInvocationResult> {
    const prompt = this.truncatePrompt(this.serializeMessages(messages));
    const startedAt = performance.now();

    try {
      const response = await fetch(`${this.openAiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openAiApiKey}`,
        },
        body: JSON.stringify({
          model: this.openAiModel,
          temperature,
          messages,
        }),
      });

      if (!response.ok) {
        const responseBody = await response.text();
        this.logger.warn(
          `OpenAI request failed with status ${response.status}: ${responseBody}`,
        );
        return {
          content: null,
          prompt,
          durationMs: performance.now() - startedAt,
        };
      }

      const responseBody = (await response.json()) as ChatCompletionResponse;
      return {
        content: responseBody.choices?.[0]?.message?.content?.trim() ?? null,
        prompt,
        durationMs: performance.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`OpenAI request failed: ${message}`);
      return {
        content: null,
        prompt,
        durationMs: performance.now() - startedAt,
      };
    }
  }

  private async requestOllama(prompt: string): Promise<LlmInvocationResult> {
    const safePrompt = this.truncatePrompt(prompt);
    const startedAt = performance.now();

    try {
      const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        const responseBody = await response.text();
        this.logger.warn(
          `Ollama request failed with status ${response.status}: ${responseBody}`,
        );
        return {
          content: null,
          prompt: safePrompt,
          durationMs: performance.now() - startedAt,
        };
      }

      const responseBody = (await response.json()) as OllamaGenerateResponse;
      return {
        content: responseBody.response?.trim() ?? null,
        prompt: safePrompt,
        durationMs: performance.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Ollama request failed: ${message}`);
      return {
        content: null,
        prompt: safePrompt,
        durationMs: performance.now() - startedAt,
      };
    }
  }

  private buildDecisionPrompt(context: DecisionContext) {
    const availableTools = [
      'create_event(title, start_time, end_time)',
      'list_events()',
      'create_note(content)',
      'get_notes(limit?)',
      'store_memory(text, memory_type?)',
      'search_memory(query)',
      'send_email(to, subject, body)',
    ];

    return this.formatPrompt([
      '### SYSTEM: AI AGENT ORCHESTRATOR ###',
      'You are the decision engine for Lumos, a real AI agent — NOT a chatbot.',
      'Your ONLY job is to classify the user intent and return a JSON decision.',
      '',
      '### RULES (MANDATORY) ###',
      '1. If the user requests an ACTION (schedule, create, send, save, remind, book, add), return USE_TOOL.',
      '2. If the user asks about themselves, their preferences, or history, return USE_MEMORY.',
      '3. If the user explicitly says "save this" or "remember this", return STORE_MEMORY.',
      '4. Only return DIRECT_ANSWER for conversational questions with no action required.',
      '5. NEVER return DIRECT_ANSWER when a tool exists for the request.',
      '',
      '### AVAILABLE TOOLS ###',
      availableTools.join('\n'),
      '',
      '### FEW-SHOT EXAMPLES ###',
      'User: "Schedule a meeting tomorrow at 5pm" → {"action":"USE_TOOL","reason":"User wants to create a calendar event"}',
      'User: "Send an email to John" → {"action":"USE_TOOL","reason":"User wants to send an email"}',
      'User: "Save this: I like coffee" → {"action":"STORE_MEMORY","reason":"User explicitly asked to save a fact"}',
      'User: "What do you know about me?" → {"action":"USE_MEMORY","reason":"User asking about stored personal info"}',
      'User: "What is the capital of France?" → {"action":"DIRECT_ANSWER","reason":"Pure factual question, no action needed"}',
      '',
      '### OUTPUT FORMAT (JSON ONLY, NO MARKDOWN) ###',
      '{"action":"USE_TOOL","reason":"..."}',
      'Valid actions: DIRECT_ANSWER, USE_MEMORY, STORE_MEMORY, USE_TOOL',
      '',
      '### CONTEXT ###',
      `Summary: ${context.conversationSummary ?? 'None'}`,
      `Memory:\n${this.formatMemorySection(context.memory)}`,
      '',
      '### CONVERSATION ###',
      this.formatConversationSection(context.recentMessages),
      '',
      '### USER MESSAGE ###',
      context.userMessage,
      '',
      'Your JSON decision:',
    ]);
  }

  private buildResponsePrompt(params: GenerateResponseParams) {
    const memoryText = this.formatMemorySection(params.memory);
    const hasMemory = params.memory.length > 0;

    return this.formatPrompt([
      '### SYSTEM: LUMOS AI AGENT ###',
      'You are Lumos, a personal AI agent. You take actions and use memory — you are NOT a chatbot.',
      '',
      '### ABSOLUTE RULES ###',
      '1. Memory IS available. NEVER say "I don\'t have memory" or "I cannot access your history".',
      '2. If memory is provided below, you MUST reference it in your response.',
      '3. Never suggest the user do things manually. You have tools.',
      '4. Be direct and confirm what was done or what you know.',
      `5. Current mode: ${params.action}.`,
      '',
      `### MEMORY (${hasMemory ? `${params.memory.length} items` : 'none'}) ###`,
      memoryText,
      '',
      '### TOOL OUTPUT ###',
      params.toolOutput ?? 'None',
      '',
      '### CONVERSATION SUMMARY ###',
      params.conversationSummary ?? 'None',
      '',
      '### RECENT CONVERSATION ###',
      this.formatConversationSection(params.recentMessages),
      '',
      '### USER MESSAGE ###',
      params.userMessage,
      '',
      'Your response:',
    ]);
  }

  private buildResponseMessages(params: GenerateResponseParams) {
    const hasMemory = params.memory.length > 0;
    const systemPrompt = [
      'You are Lumos, a personal AI agent. You take actions and use memory — you are NOT a chatbot.',
      '',
      'ABSOLUTE RULES:',
      '1. Memory IS available. NEVER say "I don\'t have memory" or "I cannot access your history".',
      '2. If memory is provided, you MUST reference specific facts from it in your response.',
      '3. Never tell the user to do things manually. You have tools that can do it for them.',
      '4. When a tool was used, confirm what action was performed.',
      `5. Current execution mode: ${params.action}.`,
    ].join('\n');

    const contextEnvelope = [
      `MEMORY (${hasMemory ? `${params.memory.length} items — USE THESE` : 'none'})`,
      this.formatMemorySection(params.memory),
      '',
      'TOOL_OUTPUT',
      params.toolOutput ?? 'None',
      '',
      'CONVERSATION_SUMMARY',
      params.conversationSummary ?? 'None',
    ].join('\n');

    return [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'system',
        content: contextEnvelope,
      },
      ...params.recentMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      {
        role: 'user',
        content: params.userMessage,
      },
    ];
  }

  private formatConversationSection(messages: Message[]) {
    if (messages.length === 0) {
      return 'None';
    }

    return messages.map((message) => `${message.role}: ${message.content}`).join('\n');
  }

  private formatMemorySection(memory: MemorySearchResult[]) {
    if (memory.length === 0) {
      return 'None';
    }

    return memory
      .map(
        (item, index) =>
          `${index + 1}. score=${item.score.toFixed(2)} importance=${(item.metadata.importance ?? 0.5).toString()} type=${(item.metadata.memory_type ?? 'fact').toString()} text=${item.text ?? ''}`,
      )
      .join('\n');
  }

  private serializeMessages(messages: Array<{ role: string; content: string }>) {
    return messages
      .map((message) => `[${message.role.toUpperCase()}]\n${message.content}`)
      .join('\n\n');
  }

  private formatPrompt(sections: string[]) {
    return this.truncatePrompt(sections.join('\n').trim());
  }

  private truncatePrompt(prompt: string) {
    const maxLength = 6000;
    return prompt.length <= maxLength
      ? prompt
      : `${prompt.slice(0, maxLength - 20)}\n...[truncated]`;
  }

  private generateFallbackResponse(params: GenerateResponseParams) {
    switch (params.action) {
      case ChatAction.USE_TOOL:
        return params.toolOutput ?? `I processed your request: ${params.userMessage}`;
      case ChatAction.USE_MEMORY:
        return params.memory.length > 0
          ? `Here is what seems most relevant from your history: ${params.memory[0].text}`
          : `I did not find matching memory, but I received: ${params.userMessage}`;
      case ChatAction.STORE_MEMORY:
        return `I'll remember that. For now, here's a response based on what you shared: ${params.userMessage}`;
      case ChatAction.DIRECT_ANSWER:
      default:
        return `I received your message and I'm ready to help: ${params.userMessage}`;
    }
  }
}
