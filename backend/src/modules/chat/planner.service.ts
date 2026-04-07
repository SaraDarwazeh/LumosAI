import { Injectable } from '@nestjs/common';
import { ChatAction, DecisionResult, PlanStep } from './chat.types';

@Injectable()
export class PlannerService {
  createPlan(userMessage: string, decision: DecisionResult): PlanStep[] | null {
    const normalizedMessage = userMessage.toLowerCase().trim();
    const hasMultipleClauses = this.hasMultipleClauses(normalizedMessage);
    const requestsExplanation = /(explain|why|what does that mean|tell me more|walk me through)/.test(
      normalizedMessage,
    );

    if (decision.action === ChatAction.USE_TOOL && (hasMultipleClauses || requestsExplanation)) {
      return [
        {
          step: 1,
          action: ChatAction.USE_TOOL,
          description: 'Run the relevant tool to gather deterministic output.',
        },
        {
          step: 2,
          action: ChatAction.DIRECT_ANSWER,
          description: 'Explain the tool result in a user-friendly way.',
        },
      ];
    }

    if (decision.action === ChatAction.STORE_MEMORY && hasMultipleClauses) {
      return [
        {
          step: 1,
          action: ChatAction.STORE_MEMORY,
          description: 'Persist the long-term information if it passes memory policy.',
        },
        {
          step: 2,
          action: ChatAction.DIRECT_ANSWER,
          description: 'Respond to the rest of the request after storage.',
        },
      ];
    }

    if (decision.action === ChatAction.USE_MEMORY && hasMultipleClauses) {
      return [
        {
          step: 1,
          action: ChatAction.USE_MEMORY,
          description: 'Fetch and ground the response with relevant memory.',
        },
        {
          step: 2,
          action: ChatAction.DIRECT_ANSWER,
          description: 'Combine recalled information into a direct answer.',
        },
      ];
    }

    return null;
  }

  private hasMultipleClauses(message: string) {
    const clauseMarkers = [' and ', ' then ', ' also ', ' after that ', '? ', '. '];
    return clauseMarkers.some((marker) => message.includes(marker));
  }
}
