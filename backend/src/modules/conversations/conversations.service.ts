import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, createConversationDto: CreateConversationDto) {
    return this.prisma.conversation.create({
      data: {
        user_id: userId,
        title: createConversationDto.title,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.conversation.findMany({
      where: {
        user_id: userId,
      },
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
    });
  }

  async findOne(userId: string, id: string) {
    return this.findConversationByIdOrThrow(userId, id);
  }

  async findConversationByIdOrThrow(userId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        user_id: userId,
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with id "${id}" was not found.`);
    }

    return conversation;
  }
}
