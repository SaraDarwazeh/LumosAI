import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from './llm.service';
import * as chrono from 'chrono-node';

export interface ToolRequest {
  toolName: string;
  parameters: Record<string, unknown>;
}

@Injectable()
export class ToolDispatcherService {
  private readonly logger = new Logger(ToolDispatcherService.name);

  constructor(private readonly llmService: LlmService) {}

  async parseToolRequest(userMessage: string): Promise<ToolRequest | null> {
    try {
      // Fast deterministic path — no LLM needed for common patterns
      const simpleMatch = this.trySimplePatternMatch(userMessage);
      if (simpleMatch) {
        return simpleMatch;
      }

      // LLM fallback with explicit field requirements and few-shot examples
      const now = new Date().toISOString();
      const prompt = `You are a tool parameter extractor for an AI agent.
Extract ALL required parameters from the user message and return ONLY a JSON object.
NO markdown, NO explanation, ONLY JSON.

Current datetime: ${now}

Available tools and REQUIRED fields:
- create_event: { "toolName": "create_event", "parameters": { "title": "string", "start_time": "ISO8601", "end_time": "ISO8601" } }
- create_note: { "toolName": "create_note", "parameters": { "content": "string" } }
- create_task: { "toolName": "create_task", "parameters": { "title": "string" } }
- store_memory: { "toolName": "store_memory", "parameters": { "text": "string" } }
- search_memory: { "toolName": "search_memory", "parameters": { "query": "string" } }
- send_email: { "toolName": "send_email", "parameters": { "to": "string", "subject": "string", "body": "string" } }
- get_notes: { "toolName": "get_notes", "parameters": {} }
- get_tasks: { "toolName": "get_tasks", "parameters": {} }

RULES:
- For create_event, ALWAYS include start_time AND end_time in ISO8601 format.
- "tomorrow at 5pm" means the next calendar day at 17:00 local time. Default duration is 1 hour.
- "next Monday" means the next Monday from today.
- If no duration given, assume 1 hour.

EXAMPLES:
User: "Schedule a meeting tomorrow at 5pm"
Output: {"toolName":"create_event","parameters":{"title":"Meeting","start_time":"2026-04-08T17:00:00","end_time":"2026-04-08T18:00:00"}}

User: "Book a call with John at 3pm today"
Output: {"toolName":"create_event","parameters":{"title":"Call with John","start_time":"2026-04-07T15:00:00","end_time":"2026-04-07T16:00:00"}}

User: "Save note: buy groceries"
Output: {"toolName":"create_note","parameters":{"content":"buy groceries"}}

User: "Send email to sarah@example.com about the report"
Output: {"toolName":"send_email","parameters":{"to":"sarah@example.com","subject":"The Report","body":"Hi, I wanted to follow up about the report."}}

User: "${userMessage}"
Output:`;

      const result = await fetch('http://ollama:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL ?? 'gemma:2b',
          prompt,
          stream: false,
          num_predict: 200,
        }),
        signal: AbortSignal.timeout(12000),
      });

      const responseBody = (await result.json()) as { response?: string };
      const rawResponse = responseBody.response?.trim() ?? '';
      this.logger.debug(`LLM tool extraction raw: ${rawResponse}`);

      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as {
        toolName?: string;
        parameters?: Record<string, unknown>;
      };

      if (!parsed?.toolName) return null;

      // Post-process: fill missing dates for create_event using chrono-node
      if (parsed.toolName === 'create_event') {
        parsed.parameters = this.enrichEventParameters(
          userMessage,
          parsed.parameters ?? {},
        );
        const validation = this.validateEventParameters(parsed.parameters);
        if (!validation.valid) {
          this.logger.warn(`create_event still missing fields after enrichment: ${validation.missing.join(', ')}`);
        }
      }

      return {
        toolName: parsed.toolName,
        parameters: parsed.parameters ?? {},
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to parse tool request: ${message}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Deterministic pattern matching (fast path — no LLM)
  // ---------------------------------------------------------------------------

  private trySimplePatternMatch(message: string): ToolRequest | null {
    const msg = message.toLowerCase();

    // Calendar / scheduling — use chrono for reliable date extraction
    if (/(schedule|book|plan|arrange|set up).*(meeting|call|event|appointment|session)|(create|add|new).*(event|meeting|appointment)/.test(msg)) {
      return this.buildEventRequest(message);
    }

    // Task patterns
    if (/(add|create|new).*(task|todo)/.test(msg)) {
      const titleMatch = message.match(/(?:task|todo|:)\s+(.+?)(?:\.|$)/i);
      return {
        toolName: 'create_task',
        parameters: { title: titleMatch?.[1]?.trim() || 'New Task' },
      };
    }
    if (/(show|list|get|what(?: are)?|what).*(my\s+)?tasks/.test(msg) || msg === 'tasks') {
      return { toolName: 'get_tasks', parameters: {} };
    }

    // Note patterns
    if (/(add|create|new).*(note)/.test(msg)) {
      const contentMatch = message.match(/(?:note|:)\s+(.+?)(?:\.|$)/i);
      return {
        toolName: 'create_note',
        parameters: {
          content: contentMatch?.[1]?.trim() || 'New Note',
          attached_to_type: 'none',
        },
      };
    }
    if (/(show|list|get|what(?: are)?|what).*(my\s+)?notes/.test(msg) || msg === 'notes') {
      return { toolName: 'get_notes', parameters: {} };
    }

    // Idea patterns
    if (/(add|have).*(idea)|create.*(idea)/.test(msg)) {
      const titleMatch = message.match(/(?:idea|:)\s+(.+?)(?:\.|$)/i);
      return {
        toolName: 'create_idea',
        parameters: { title: titleMatch?.[1]?.trim() || 'New Idea' },
      };
    }
    if (/(show|list|get|what(?: are)?|what).*(my\s+)?ideas/.test(msg) || msg === 'ideas') {
      return { toolName: 'get_ideas', parameters: {} };
    }

    // Email patterns
    if (/\b(send|write|compose|draft)\b.*(email|mail)/.test(msg)) {
      const toMatch = message.match(/to\s+([\w.@+-]+@[\w.+-]+)/i);
      const subjectMatch = message.match(/(?:about|re:|subject:)\s+(.+?)(?:\.|$)/i);
      return {
        toolName: 'send_email',
        parameters: {
          to: toMatch?.[1] ?? '',
          subject: subjectMatch?.[1]?.trim() ?? 'Message',
          body: message,
        },
      };
    }

    // Memory patterns
    if (/^(save this|remember this)/i.test(message.trim())) {
      const content = message.replace(/^(save this|remember this)[:\s]*/i, '').trim();
      return { toolName: 'store_memory', parameters: { text: content } };
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Calendar event construction with chrono-node date parsing
  // ---------------------------------------------------------------------------

  private buildEventRequest(message: string): ToolRequest {
    const parameters = this.enrichEventParameters(message, {});

    // Extract a human-readable title from the message
    const titleMatch = message.match(
      /(?:schedule|book|plan|arrange|create|add|set up)\s+(?:a\s+)?(?:meeting|call|event|appointment|session)?\s*(?:with\s+[\w\s]+?)?\s*(?:called|named|titled|about|for)?\s*(.+?)(?:\s+(?:at|on|tomorrow|next|this|from)\b|$)/i,
    );
    const rawTitle = titleMatch?.[1]?.trim();

    if (!parameters['title'] || parameters['title'] === 'New Event') {
      // Derive a clean title: "meeting tomorrow at 5pm" → "Meeting"
      const keywordMatch = message.match(/\b(meeting|call|event|appointment|session)\b/i);
      const withMatch = message.match(/with\s+([\w\s]+?)(?:\s+(?:at|on|tomorrow|next|from|\d)|$)/i);
      const aboutMatch = message.match(/about\s+(.+?)(?:\s+(?:at|on|tomorrow|next|from|\d)|$)/i);

      if (withMatch?.[1]) {
        parameters['title'] = `${keywordMatch?.[1] ?? 'Meeting'} with ${withMatch[1].trim()}`;
      } else if (aboutMatch?.[1]) {
        parameters['title'] = `${keywordMatch?.[1] ?? 'Meeting'}: ${aboutMatch[1].trim()}`;
      } else if (rawTitle) {
        parameters['title'] = rawTitle;
      } else {
        parameters['title'] = keywordMatch?.[1]
          ? keywordMatch[1].charAt(0).toUpperCase() + keywordMatch[1].slice(1)
          : 'Meeting';
      }
    }

    return { toolName: 'create_event', parameters };
  }

  private enrichEventParameters(
    message: string,
    existing: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...existing };

    // Only run chrono if start_time is missing or invalid
    const hasValidStart = this.isValidIso(result['start_time'] as string);
    const hasValidEnd = this.isValidIso(result['end_time'] as string);

    if (!hasValidStart || !hasValidEnd) {
      const parsed = chrono.parse(message, new Date(), { forwardDate: true });
      if (parsed.length > 0) {
        const hit = parsed[0];
        const start = hit.start.date();
        const end = hit.end?.date() ?? new Date(start.getTime() + 60 * 60 * 1000);

        if (!hasValidStart) result['start_time'] = start.toISOString();
        if (!hasValidEnd) result['end_time'] = end.toISOString();
      } else {
        // Absolute fallback: next hour boundary
        if (!hasValidStart) {
          const fallback = new Date();
          fallback.setHours(fallback.getHours() + 1, 0, 0, 0);
          result['start_time'] = fallback.toISOString();
        }
        if (!hasValidEnd) {
          const end = new Date(result['start_time'] as string);
          end.setHours(end.getHours() + 1);
          result['end_time'] = end.toISOString();
        }
      }
    }

    return result;
  }

  private validateEventParameters(params: Record<string, unknown>): {
    valid: boolean;
    missing: string[];
  } {
    const required = ['title', 'start_time', 'end_time'];
    const missing = required.filter(
      (field) => !params[field] || params[field] === '',
    );
    return { valid: missing.length === 0, missing };
  }

  private isValidIso(value: string | undefined | null): boolean {
    if (!value) return false;
    const d = new Date(value);
    return !isNaN(d.getTime());
  }
}
