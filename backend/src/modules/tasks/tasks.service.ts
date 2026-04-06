import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { GetTasksQueryDto } from './dto/get-tasks-query.dto';
import { UpdateTaskLabelsDto } from './dto/update-task-labels.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const taskWithLabelsInclude = {
  labels: {
    include: {
      label: true,
    },
  },
} satisfies Prisma.TaskInclude;

type TaskWithLabels = Prisma.TaskGetPayload<{
  include: typeof taskWithLabelsInclude;
}>;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, createTaskDto: CreateTaskDto) {
    const labelIds = this.getUniqueLabelIds(createTaskDto.labels);

    if (labelIds.length > 0) {
      await this.ensureLabelsExist(userId, labelIds);
    }

    const task = await this.prisma.task.create({
      data: {
        user_id: userId,
        title: createTaskDto.title,
        description: createTaskDto.description,
        due_date: createTaskDto.due_date ? new Date(createTaskDto.due_date) : undefined,
        priority: createTaskDto.priority,
        labels:
          labelIds.length > 0
            ? {
                create: labelIds.map((labelId) => ({
                  label: {
                    connect: { id: labelId },
                  },
                })),
              }
            : undefined,
      },
      include: taskWithLabelsInclude,
    });

    return this.serializeTask(task);
  }

  async findAll(userId: string, query: GetTasksQueryDto) {
    const where: Prisma.TaskWhereInput = {
      user_id: userId,
      status: query.status,
      labels: query.label_id
        ? {
            some: {
              label_id: query.label_id,
            },
          }
        : undefined,
    };

    if (query.due_date) {
      const { startOfDayUtc, endOfDayUtc } = this.getUtcDayBounds(query.due_date);
      where.due_date = {
        gte: startOfDayUtc,
        lte: endOfDayUtc,
      };
    }

    const tasks = await this.prisma.task.findMany({
      where,
      include: taskWithLabelsInclude,
      orderBy: [{ due_date: 'asc' }, { created_at: 'desc' }],
    });

    return tasks.map((task) => this.serializeTask(task));
  }

  async update(userId: string, id: string, updateTaskDto: UpdateTaskDto) {
    const existingTask = await this.findTaskByIdOrThrow(userId, id);
    const task = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.task.updateMany({
        where: {
          id,
          user_id: userId,
        },
        data: {
          title: updateTaskDto.title,
          description:
            updateTaskDto.description !== undefined
              ? updateTaskDto.description ?? null
              : undefined,
          status: updateTaskDto.status,
          due_date:
            updateTaskDto.due_date !== undefined
              ? updateTaskDto.due_date
                ? new Date(updateTaskDto.due_date)
                : null
              : undefined,
          priority: updateTaskDto.priority,
          completed_at:
            updateTaskDto.status !== undefined
              ? updateTaskDto.status === TaskStatus.done
                ? existingTask.completed_at ?? new Date()
                : null
              : undefined,
        },
      });

      if (updateResult.count === 0) {
        throw new NotFoundException(`Task with id "${id}" was not found.`);
      }

      const updatedTask = await tx.task.findFirst({
        where: {
          id,
          user_id: userId,
        },
        include: taskWithLabelsInclude,
      });

      if (!updatedTask) {
        throw new NotFoundException(`Task with id "${id}" was not found.`);
      }

      return updatedTask;
    });

    return this.serializeTask(task);
  }

  async updateTaskLabels(
    userId: string,
    taskId: string,
    updateTaskLabelsDto: UpdateTaskLabelsDto,
  ) {
    await this.findTaskByIdOrThrow(userId, taskId);

    const labelIds = this.getUniqueLabelIds(updateTaskLabelsDto.label_ids);

    if (labelIds.length > 0) {
      await this.ensureLabelsExist(userId, labelIds);
    }

    const updatedTask = await this.prisma.$transaction(async (tx) => {
      await tx.taskLabel.deleteMany({
        where: {
          task_id: taskId,
        },
      });

      if (labelIds.length > 0) {
        await tx.taskLabel.createMany({
          data: labelIds.map((labelId) => ({
            task_id: taskId,
            label_id: labelId,
          })),
        });
      }

      const task = await tx.task.findFirst({
        where: {
          id: taskId,
          user_id: userId,
        },
        include: taskWithLabelsInclude,
      });

      if (!task) {
        throw new NotFoundException(`Task with id "${taskId}" was not found.`);
      }

      return task;
    });

    return this.serializeTask(updatedTask);
  }

  async remove(userId: string, id: string) {
    const deleteResult = await this.prisma.task.deleteMany({
      where: {
        id,
        user_id: userId,
      },
    });

    if (deleteResult.count === 0) {
      throw new NotFoundException(`Task with id "${id}" was not found.`);
    }

    return null;
  }

  private async ensureLabelsExist(userId: string, labelIds: string[]) {
    const labels = await this.prisma.label.findMany({
      where: {
        id: { in: labelIds },
        user_id: userId,
      },
      select: { id: true },
    });

    if (labels.length !== labelIds.length) {
      throw new BadRequestException(
        'One or more labels were not found for the current user.',
      );
    }
  }

  private getUniqueLabelIds(labelIds?: string[]) {
    return [...new Set(labelIds ?? [])];
  }

  private async findTaskByIdOrThrow(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        id,
        user_id: userId,
      },
      select: {
        id: true,
        completed_at: true,
      },
    });

    if (!task) {
      throw new NotFoundException(`Task with id "${id}" was not found.`);
    }

    return task;
  }

  private getUtcDayBounds(dateString: string) {
    const date = new Date(dateString);
    const startOfDayUtc = new Date(date);
    const endOfDayUtc = new Date(date);

    startOfDayUtc.setUTCHours(0, 0, 0, 0);
    endOfDayUtc.setUTCHours(23, 59, 59, 999);

    return { startOfDayUtc, endOfDayUtc };
  }

  private serializeTask(task: TaskWithLabels) {
    const { labels, ...taskData } = task;

    return {
      ...taskData,
      labels: labels.map(({ label }) => label),
    };
  }
}
