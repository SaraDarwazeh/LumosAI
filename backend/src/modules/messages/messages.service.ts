import { Injectable } from '@nestjs/common';
import { MessageRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { MemoryClient } from '../../clients/memory.client';
import { PrismaService } from '../../database/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { GetMessagesQueryDto } from './dto/get-messages-query.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly memoryClient: MemoryClient,
  ) {}

  async create(userId: string, createMessageDto: CreateMessageDto) {
    return this.createMessage(
      userId,
      createMessageDto.conversation_id,
      createMessageDto.role,
      createMessageDto.content,
    );
  }

  async findAll(userId: string, query: GetMessagesQueryDto) {
    await this.conversationsService.findConversationByIdOrThrow(
      userId,
      query.conversation_id,
    );

    return this.prisma.message.findMany({
      where: {
        conversation_id: query.conversation_id,
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
  }

  async createMessage(
    userId: string,
    conversationId: string,
    role: MessageRole,
    content: string,
  ) {
    await this.conversationsService.findConversationByIdOrThrow(userId, conversationId);

    const message = await this.prisma.message.create({
      data: {
        conversation_id: conversationId,
        role,
        content,
      },
    });

    void this.memoryClient.indexMemory({
      id: message.id,
      text: message.content,
      type: 'message',
      metadata: {
        user_id: userId,
        conversation_id: conversationId,
        role: role,
        message_role: role,
        source: 'chat_message',
      },
    });

    if (role === MessageRole.user) {
      const userSignal = this.extractUserSignal(message.content);
      if (userSignal) {
        void this.memoryClient.indexMemory({
          id: randomUUID(),
          text: userSignal.text,
          type: 'signal',
          metadata: {
            user_id: userId,
            conversation_id: conversationId,
            role: role,
            source: 'user_signal',
            memory_type: userSignal.memoryType,
            signal_type: userSignal.signalType,
          },
        });
      }
    }

    return message;
  }

  private extractUserSignal(content: string): {
    text: string;
    memoryType: 'preference' | 'habit';
    signalType: string;
  } | null {
    const normalized = content.trim().toLowerCase();

    const preferenceMatch = normalized.match(/\b(?:i like|i love|i prefer|my favorite|i'm a fan of|i enjoy)\b\s*(.+)/i);
    if (preferenceMatch && preferenceMatch[1]) {
      return {
        text: `Preference detected: ${preferenceMatch[0].trim()}`,
        memoryType: 'preference',
        signalType: 'preference',
      };
    }

    const habitMatch = normalized.match(/\b(?:i usually|i often|i always|i typically|i normally|i tend to)\b\s*(.+)/i);
    if (habitMatch && habitMatch[0]) {
      return {
        text: `Habit detected: ${habitMatch[0].trim()}`,
        memoryType: 'habit',
        signalType: 'habit',
      };
    }

    const nightPreferenceMatch = normalized.match(/\b(i like studying at night|i study at night|i work at night|night preference)\b/i);
    if (nightPreferenceMatch && nightPreferenceMatch[0]) {
      return {
        text: `Preference detected: ${nightPreferenceMatch[0].trim()}`,
        memoryType: 'preference',
        signalType: 'preference',
      };
    }

    return null;
  }

  async findRecentByConversation(
    userId: string,
    conversationId: string,
    limit: number,
  ) {
    await this.conversationsService.findConversationByIdOrThrow(userId, conversationId);

    const messages = await this.prisma.message.findMany({
      where: {
        conversation_id: conversationId,
      },
      take: limit,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });

    return [...messages].reverse();
  }
}
