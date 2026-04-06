import { Injectable, NotFoundException } from '@nestjs/common';
import { MemoryClient } from '../../clients/memory.client';
import { PrismaService } from '../../database/prisma.service';
import { CreateIdeaDto } from './dto/create-idea.dto';
import { UpdateIdeaDto } from './dto/update-idea.dto';

@Injectable()
export class IdeasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryClient: MemoryClient,
  ) {}

  async create(userId: string, createIdeaDto: CreateIdeaDto) {
    const idea = await this.prisma.idea.create({
      data: {
        user_id: userId,
        title: createIdeaDto.title,
        description: createIdeaDto.description,
        status: createIdeaDto.status,
      },
    });

    this.syncIdeaToMemory(userId, idea);

    return idea;
  }

  async findAll(userId: string) {
    return this.prisma.idea.findMany({
      where: {
        user_id: userId,
      },
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
    });
  }

  async update(userId: string, id: string, updateIdeaDto: UpdateIdeaDto) {
    const updateResult = await this.prisma.idea.updateMany({
      where: {
        id,
        user_id: userId,
      },
      data: {
        title: updateIdeaDto.title,
        description:
          updateIdeaDto.description !== undefined
            ? updateIdeaDto.description ?? null
            : undefined,
        status: updateIdeaDto.status,
      },
    });

    if (updateResult.count === 0) {
      throw new NotFoundException(`Idea with id "${id}" was not found.`);
    }

    const updatedIdea = await this.findIdeaByIdOrThrow(userId, id);
    this.syncIdeaToMemory(userId, updatedIdea);

    return updatedIdea;
  }

  async remove(userId: string, id: string) {
    await this.findIdeaByIdOrThrow(userId, id);

    const deleteResult = await this.prisma.idea.deleteMany({
      where: {
        id,
        user_id: userId,
      },
    });

    if (deleteResult.count === 0) {
      throw new NotFoundException(`Idea with id "${id}" was not found.`);
    }

    void this.memoryClient.deleteMemory(id);

    return null;
  }

  private syncIdeaToMemory(userId: string, idea: {
    id: string;
    title: string;
    description: string | null;
  }) {
    void this.memoryClient.indexMemory({
      id: idea.id,
      text: [idea.title, idea.description].filter(Boolean).join(' '),
      type: 'idea',
      metadata: {
        user_id: userId,
      },
    });
  }

  private async findIdeaByIdOrThrow(userId: string, id: string) {
    const idea = await this.prisma.idea.findFirst({
      where: {
        id,
        user_id: userId,
      },
    });

    if (!idea) {
      throw new NotFoundException(`Idea with id "${id}" was not found.`);
    }

    return idea;
  }
}
