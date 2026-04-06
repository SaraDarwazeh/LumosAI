import type { User } from '@prisma/client';
import type { DecodedIdToken } from 'firebase-admin/auth';

export type AuthenticatedUser = User;

export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  firebaseUser?: DecodedIdToken;
  user?: AuthenticatedUser;
}
