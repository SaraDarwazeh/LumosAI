import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, createLabelDto: CreateLabelDto) {
    await this.ensureNameIsUnique(userId, createLabelDto.name);

    return this.prisma.label.create({
      data: {
        user_id: userId,
        name: createLabelDto.name,
        color: createLabelDto.color,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.label.findMany({
      where: {
        user_id: userId,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async update(userId: string, id: string, updateLabelDto: UpdateLabelDto) {
    const existingLabel = await this.findLabelByIdOrThrow(userId, id);

    if (
      updateLabelDto.name !== undefined &&
      updateLabelDto.name !== existingLabel.name
    ) {
      await this.ensureNameIsUnique(userId, updateLabelDto.name, id);
    }

    const updateResult = await this.prisma.label.updateMany({
      where: {
        id,
        user_id: userId,
      },
      data: {
        name: updateLabelDto.name,
        color: updateLabelDto.color,
      },
    });

    if (updateResult.count === 0) {
      throw new NotFoundException(`Label with id "${id}" was not found.`);
    }

    return this.findLabelByIdOrThrow(userId, id);
  }

  async remove(userId: string, id: string) {
    const deleteResult = await this.prisma.label.deleteMany({
      where: {
        id,
        user_id: userId,
      },
    });

    if (deleteResult.count === 0) {
      throw new NotFoundException(`Label with id "${id}" was not found.`);
    }

    return null;
  }

  private async ensureNameIsUnique(
    userId: string,
    name: string,
    excludedLabelId?: string,
  ) {
    const existingLabel = await this.prisma.label.findFirst({
      where: {
        user_id: userId,
        name,
        id: excludedLabelId
          ? {
              not: excludedLabelId,
            }
          : undefined,
      },
      select: {
        id: true,
      },
    });

    if (existingLabel) {
      throw new BadRequestException(
        `A label named "${name}" already exists for the current user.`,
      );
    }
  }

  private async findLabelByIdOrThrow(userId: string, id: string) {
    const label = await this.prisma.label.findFirst({
      where: {
        id,
        user_id: userId,
      },
    });

    if (!label) {
      throw new NotFoundException(`Label with id "${id}" was not found.`);
    }

    return label;
  }
}
