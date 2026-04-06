import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DecodedIdToken } from 'firebase-admin/auth';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreateUser(firebaseUser: DecodedIdToken) {
    const firebaseUid = firebaseUser.uid;
    const email = firebaseUser.email ?? `${firebaseUid}@firebase.local`;
    const name = typeof firebaseUser.name === 'string' ? firebaseUser.name : null;

    return this.prisma.user.upsert({
      where: {
        firebase_uid: firebaseUid,
      },
      update: {
        email,
        name,
      },
      create: {
        firebase_uid: firebaseUid,
        email,
        name,
      },
    });
  }
}
