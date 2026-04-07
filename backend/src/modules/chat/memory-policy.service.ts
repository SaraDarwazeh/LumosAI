import { Injectable } from '@nestjs/common';
import { MemoryPolicyDecision } from './chat.types';

@Injectable()
export class MemoryPolicyService {
  evaluate(content: string, existingMemory: string[] = []): MemoryPolicyDecision {
    const normalizedContent = content.toLowerCase().trim();

    if (normalizedContent.startsWith('save this') || normalizedContent.startsWith('remember this')) {
      return {
        shouldStore: true,
        importance: 0.9,
        confidence: 1.0,
        memoryType: this.inferMemoryType(normalizedContent),
        reason: 'Explicitly commanded to save memory by the user.',
      };
    }

    if (this.isMemorySpam(normalizedContent, existingMemory)) {
      return {
        shouldStore: false,
        importance: 0.05,
        confidence: 0.9,
        memoryType: 'fact',
        reason: 'The message is repetitive, too short, or too generic to store.',
      };
    }

    if (this.isLongTermPersonalInfo(normalizedContent)) {
      return {
        shouldStore: true,
        importance: this.inferImportance(normalizedContent),
        confidence: 0.9,
        memoryType: this.inferMemoryType(normalizedContent),
        reason: 'The message contains durable personal information or a stable preference.',
      };
    }

    if (this.isTemporaryOrGeneric(normalizedContent)) {
      return {
        shouldStore: false,
        importance: 0.1,
        confidence: 0.85,
        memoryType: this.inferMemoryType(normalizedContent),
        reason: 'The message looks temporary, generic, or task-specific rather than durable.',
      };
    }

    return {
      shouldStore: false,
      importance: 0.2,
      confidence: 0.6,
      memoryType: this.inferMemoryType(normalizedContent),
      reason: 'The message does not clearly contain long-term memory material.',
    };
  }

  private isLongTermPersonalInfo(content: string) {
    return /(my name is|i prefer|i like|my favorite|i work at|i live in|i am allergic to|i usually|please remember|remember that)/.test(
      content,
    );
  }

  private isTemporaryOrGeneric(content: string) {
    return /(today|tomorrow|this week|right now|currently|weather|calculate|compute|what is|can you|should i|help me with)/.test(
      content,
    );
  }

  private isMemorySpam(content: string, existingMemory: string[]) {
    if (content.length < 20 || content.endsWith('?')) {
      return true;
    }

    return existingMemory.some((memoryItem) => this.normalize(memoryItem) === this.normalize(content));
  }

  private inferImportance(content: string) {
    if (/(my name is|i am allergic to|i work at|i live in)/.test(content)) {
      return 0.95;
    }

    if (/(i prefer|i like|my favorite|i usually)/.test(content)) {
      return 0.8;
    }

    if (/(my goal is|i want to|i am trying to)/.test(content)) {
      return 0.75;
    }

    return 0.55;
  }

  private inferMemoryType(content: string): 'fact' | 'preference' | 'goal' {
    if (/(i prefer|i like|my favorite|i usually)/.test(content)) {
      return 'preference';
    }

    if (/(my goal is|i want to|i am trying to|i plan to)/.test(content)) {
      return 'goal';
    }

    return 'fact';
  }

  private normalize(content: string) {
    return content.toLowerCase().replace(/\s+/g, ' ').trim();
  }
}
