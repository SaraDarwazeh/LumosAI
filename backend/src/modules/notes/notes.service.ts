import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttachedToType } from '@prisma/client';
import { MemoryClient } from '../../clients/memory.client';
import { PrismaService } from '../../database/prisma.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryClient: MemoryClient,
  ) {}

  async create(userId: string, createNoteDto: CreateNoteDto) {
    const attachment = await this.resolveAttachment(userId, createNoteDto);

    const note = await this.prisma.note.create({
      data: {
        user_id: userId,
        content: createNoteDto.content,
        attached_to_type: createNoteDto.attached_to_type,
        attached_to_id: attachment.attachedToId,
        task_id: attachment.taskId,
        idea_id: attachment.ideaId,
      },
    });

    this.syncNoteToMemory(userId, note);

    return note;
  }

  async findAll(userId: string) {
    return this.prisma.note.findMany({
      where: {
        user_id: userId,
      },
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
    });
  }

  async update(userId: string, id: string, updateNoteDto: UpdateNoteDto) {
    const existingNote = await this.findNoteByIdOrThrow(userId, id);
    const noteState = {
      content: updateNoteDto.content ?? existingNote.content,
      attached_to_type: updateNoteDto.attached_to_type ?? existingNote.attached_to_type,
      attached_to_id:
        updateNoteDto.attached_to_id !== undefined
          ? updateNoteDto.attached_to_id
          : existingNote.attached_to_id,
    };
    const attachment = await this.resolveAttachment(userId, noteState);

    const updateResult = await this.prisma.note.updateMany({
      where: {
        id,
        user_id: userId,
      },
      data: {
        content: noteState.content,
        attached_to_type: noteState.attached_to_type,
        attached_to_id: attachment.attachedToId,
        task_id: attachment.taskId,
        idea_id: attachment.ideaId,
      },
    });

    if (updateResult.count === 0) {
      throw new NotFoundException(`Note with id "${id}" was not found.`);
    }

    const updatedNote = await this.findNoteByIdOrThrow(userId, id);
    this.syncNoteToMemory(userId, updatedNote);

    return updatedNote;
  }

  async remove(userId: string, id: string) {
    await this.findNoteByIdOrThrow(userId, id);

    const deleteResult = await this.prisma.note.deleteMany({
      where: {
        id,
        user_id: userId,
      },
    });

    if (deleteResult.count === 0) {
      throw new NotFoundException(`Note with id "${id}" was not found.`);
    }

    void this.memoryClient.deleteMemory(id);

    return null;
  }

  private syncNoteToMemory(userId: string, note: {
    id: string;
    content: string;
    attached_to_type: AttachedToType;
    attached_to_id: string | null;
  }) {
    void this.memoryClient.indexMemory({
      id: note.id,
      text: note.content,
      type: 'note',
      metadata: {
        user_id: userId,
        attached_to_type: note.attached_to_type,
        attached_to_id: note.attached_to_id,
      },
    });
  }

  private async resolveAttachment(userId: string, noteInput: {
    attached_to_type: AttachedToType;
    attached_to_id?: string | null;
  }) {
    switch (noteInput.attached_to_type) {
      case AttachedToType.task:
        return this.resolveTaskAttachment(userId, noteInput.attached_to_id);
      case AttachedToType.idea:
        return this.resolveIdeaAttachment(userId, noteInput.attached_to_id);
      case AttachedToType.none:
        if (noteInput.attached_to_id) {
          throw new BadRequestException(
            'attached_to_id must not be provided when attached_to_type is "none".',
          );
        }

        return {
          attachedToId: null,
          taskId: null,
          ideaId: null,
        };
      default:
        throw new BadRequestException('Invalid attached_to_type provided.');
    }
  }

  private async findNoteByIdOrThrow(userId: string, id: string) {
    const note = await this.prisma.note.findFirst({
      where: {
        id,
        user_id: userId,
      },
    });

    if (!note) {
      throw new NotFoundException(`Note with id "${id}" was not found.`);
    }

    return note;
  }

  private async resolveTaskAttachment(userId: string, attachedToId?: string | null) {
    if (!attachedToId) {
      throw new BadRequestException(
        'attached_to_id is required when attached_to_type is "task".',
      );
    }

    const task = await this.prisma.task.findFirst({
      where: {
        id: attachedToId,
        user_id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!task) {
      throw new BadRequestException(
        `Task with id "${attachedToId}" was not found for the current user.`,
      );
    }

    return {
      attachedToId: task.id,
      taskId: task.id,
      ideaId: null,
    };
  }

  private async resolveIdeaAttachment(userId: string, attachedToId?: string | null) {
    if (!attachedToId) {
      throw new BadRequestException(
        'attached_to_id is required when attached_to_type is "idea".',
      );
    }

    const idea = await this.prisma.idea.findFirst({
      where: {
        id: attachedToId,
        user_id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!idea) {
      throw new BadRequestException(
        `Idea with id "${attachedToId}" was not found for the current user.`,
      );
    }

    return {
      attachedToId: idea.id,
      taskId: null,
      ideaId: idea.id,
    };
  }
}
