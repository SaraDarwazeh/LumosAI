import { Message } from '@prisma/client';
import { MemorySearchResult } from '../../clients/memory.client';

export enum ChatAction {
  DIRECT_ANSWER = 'DIRECT_ANSWER',
  USE_MEMORY = 'USE_MEMORY',
  STORE_MEMORY = 'STORE_MEMORY',
  USE_TOOL = 'USE_TOOL',
}

export type DecisionSource = 'rule' | 'llm' | 'fallback';
export type MemoryKind = 'fact' | 'preference' | 'goal';

export interface DecisionContext {
  userMessage: string;
  conversationSummary: string | null;
  recentMessages: Message[];
  memory: MemorySearchResult[];
}

export interface DecisionResult {
  action: ChatAction;
  reason: string;
  source: DecisionSource;
}

export interface PlanStep {
  step: number;
  action: ChatAction;
  description: string;
}

export interface MemoryPolicyDecision {
  shouldStore: boolean;
  importance: number;
  confidence: number;
  memoryType: MemoryKind;
  reason: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolExecutionResult {
  tool: string;
  output: string;
}

export interface LlmInvocationResult {
  content: string | null;
  prompt: string;
  durationMs: number;
}

export interface ExecutionStep {
  name: string;
  status: 'completed' | 'skipped' | 'failed';
  duration_ms?: number;
  details?: Record<string, unknown>;
}
