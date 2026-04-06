import { Injectable, Logger } from '@nestjs/common';
import { DecodedIdToken } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private readonly auth: admin.auth.Auth;

  constructor() {
    const app = admin.apps.length > 0
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert(this.loadServiceAccount()),
        });

    this.auth = app.auth();
  }

  async verifyToken(token: string): Promise<DecodedIdToken> {
    return this.auth.verifyIdToken(token);
  }

  private loadServiceAccount(): admin.ServiceAccount {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      ?? join(process.cwd(), 'firebase', 'serviceAccountKey.json');

    if (!existsSync(serviceAccountPath)) {
      this.logger.error(`Firebase service account file not found at ${serviceAccountPath}`);
      throw new Error('Firebase service account file is missing.');
    }

    return JSON.parse(
      readFileSync(serviceAccountPath, 'utf8'),
    ) as admin.ServiceAccount;
  }
}
