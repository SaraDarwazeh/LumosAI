import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { GoogleModule } from './modules/google/google.module';
import { HealthModule } from './modules/health/health.module';

// Domain modules (scaffolded — no logic yet)
import { TasksModule } from './modules/tasks/tasks.module';
import { NotesModule } from './modules/notes/notes.module';
import { IdeasModule } from './modules/ideas/ideas.module';
import { LabelsModule } from './modules/labels/labels.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { UsersModule } from './modules/users/users.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { ActivityLogsModule } from './modules/activity-logs/activity-logs.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessagesModule } from './modules/messages/messages.module';
import { ChatModule } from './modules/chat/chat.module';

@Module({
  imports: [
    // Load .env globally — available everywhere via ConfigService
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Prisma DB layer
    DatabaseModule,
    AuthModule,
    UsersModule,
    GoogleModule,

    // Domain modules
    TasksModule,
    NotesModule,
    IdeasModule,
    LabelsModule,
    RemindersModule,
    ConversationsModule,
    MessagesModule,
    ChatModule,
    HealthModule,
    IntegrationsModule,
    ActivityLogsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
