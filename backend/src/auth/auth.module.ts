import { Module } from '@nestjs/common';
import { UsersModule } from '../modules/users/users.module';
import { AuthGuard } from './auth.guard';
import { FirebaseService } from './firebase.service';

@Module({
  imports: [UsersModule],
  providers: [FirebaseService, AuthGuard],
  exports: [FirebaseService, AuthGuard],
})
export class AuthModule {}
