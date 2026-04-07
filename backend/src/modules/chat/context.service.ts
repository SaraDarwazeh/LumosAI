import { Injectable } from '@nestjs/common';
import { Message } from '@prisma/client';
import { MemorySearchResult } from '../../clients/memory.client';

const MAX_CONTEXT_CHARACTERS = 3000;
const MAX_MEMORY_ITEMS = 4;
const MIN_MEMORY_SCORE = 0.45;

interface BuildContextParams {
  userId: string;
  conversation: Message[];
  memory: MemorySearchResult[];
}

@Injectable()
export class ContextService {
  buildContext({ userId, conversation, memory }: BuildContextParams) {
    const { summary, recentMessages } = this.selectConversationContext(conversation);
    const rankedMemory = this.rankMemory(memory);

    return {
      summary,
      conversation: recentMessages,
      memory: rankedMemory,
      user_id: userId,
    };
  }

  summarizeConversation(conversation: Message[]) {
    if (conversation.length <= 8) {
      return null;
    }

    const olderMessages = conversation.slice(0, -this.getRecentMessageLimit(conversation));
    if (olderMessages.length === 0) {
      return null;
    }

    const distilledLines = olderMessages.slice(-6).map((message) => {
      const compactContent = this.compactText(message.content, 140);
      return `${message.role}: ${compactContent}`;
    });

    return `Earlier conversation highlights:\n${distilledLines.join('\n')}`;
  }

  private selectConversationContext(conversation: Message[]) {
    const summary = this.summarizeConversation(conversation);
    const recentLimit = this.getRecentMessageLimit(conversation);
    const recentMessages = conversation.slice(-recentLimit);

    return {
      summary,
      recentMessages: this.trimConversationToBudget(recentMessages),
    };
  }

  private getRecentMessageLimit(conversation: Message[]) {
    if (conversation.length <= 8) {
      return conversation.length;
    }

    if (conversation.length <= 20) {
      return 8;
    }

    return 10;
  }

  private trimConversationToBudget(conversation: Message[]) {
    const selectedMessages: Message[] = [];
    let remainingBudget = MAX_CONTEXT_CHARACTERS;

    for (const message of [...conversation].reverse()) {
      const messageLength = message.content.length;
      if (selectedMessages.length > 0 && messageLength > remainingBudget) {
        continue;
      }

      selectedMessages.unshift(message);
      remainingBudget -= messageLength;

      if (remainingBudget <= 0) {
        break;
      }
    }

    return selectedMessages;
  }

  private rankMemory(memory: MemorySearchResult[]) {
    const now = Date.now();

    return memory
      .map((item) => {
        const timestamp = item.timestamp ? new Date(item.timestamp).getTime() : 0;
        const ageInDays =
          timestamp > 0 ? Math.max(0, (now - timestamp) / (1000 * 60 * 60 * 24)) : 365;
        const recencyWeight = Math.max(0, 1 - ageInDays / 30);
        const importance = this.clampImportance(item.metadata.importance);
        const compositeScore =
          item.score * 0.7 + recencyWeight * 0.2 + importance * 0.1;

        return {
          ...item,
          score: Number(compositeScore.toFixed(4)),
        };
      })
      .filter((item) => item.score >= MIN_MEMORY_SCORE)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.id.localeCompare(right.id);
      })
      .slice(0, MAX_MEMORY_ITEMS);
  }

  private compactText(content: string, maxLength: number) {
    return content.length <= maxLength
      ? content
      : `${content.slice(0, maxLength - 3).trimEnd()}...`;
  }

  private clampImportance(importance: unknown) {
    if (typeof importance !== 'number' || Number.isNaN(importance)) {
      return 0.5;
    }

    return Math.min(1, Math.max(0, importance));
  }
}
