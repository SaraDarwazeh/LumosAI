import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { GetRemindersQueryDto } from './dto/get-reminders-query.dto';

type ReminderWithTask = Prisma.ReminderGetPayload<{
  include: { task: true };
}>;

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, createReminderDto: CreateReminderDto) {
    if (!createReminderDto.task_id) {
      throw new BadRequestException(
        'task_id is required for authenticated reminders.',
      );
    }

    await this.findTaskByIdOrThrow(userId, createReminderDto.task_id);

    const scheduledAt = this.parseAndValidateScheduledAt(createReminderDto.scheduled_at);

    return this.prisma.reminder.create({
      data: {
        task_id: createReminderDto.task_id,
        type: createReminderDto.type,
        scheduled_at: scheduledAt,
      },
    });
  }

  async findAll(userId: string, query: GetRemindersQueryDto) {
    if (query.task_id) {
      await this.findTaskByIdOrThrow(userId, query.task_id);
    }

    const where: Prisma.ReminderWhereInput = {
      status: query.status,
      task: {
        user_id: userId,
      },
      ...(query.task_id
        ? {
            task_id: query.task_id,
          }
        : {}),
    };

    return this.prisma.reminder.findMany({
      where,
      orderBy: [{ scheduled_at: 'asc' }, { id: 'asc' }],
    });
  }

  async remove(userId: string, id: string) {
    const reminder = await this.findReminderByIdOrThrow(id);

    if (!reminder.task || reminder.task.user_id !== userId) {
      throw new NotFoundException(`Reminder with id "${id}" was not found.`);
    }

    await this.prisma.reminder.delete({
      where: {
        id: reminder.id,
      },
    });

    return null;
  }

  private async findTaskByIdOrThrow(userId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        user_id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!task) {
      throw new NotFoundException(`Task with id "${taskId}" was not found.`);
    }

    return task;
  }

  private async findReminderByIdOrThrow(id: string): Promise<ReminderWithTask> {
    const reminder = await this.prisma.reminder.findUnique({
      where: {
        id,
      },
      include: {
        task: true,
      },
    });

    if (!reminder) {
      throw new NotFoundException(`Reminder with id "${id}" was not found.`);
    }

    return reminder;
  }

  private parseAndValidateScheduledAt(scheduledAt: string) {
    const parsedDate = new Date(scheduledAt);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException('scheduled_at must be a valid ISO date string.');
    }

    if (parsedDate <= new Date()) {
      throw new BadRequestException('scheduled_at must be a future date.');
    }

    return parsedDate;
  }
}
