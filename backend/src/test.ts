import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  
  // ensure we have a fresh valid test user
  await prisma.user.deleteMany({ where: { firebase_uid: { startsWith: 'agent_test' } } });
  const user = await prisma.user.create({
    data: {
      id: "b49c4cfb-b791-49e0-bcde-9d7893f90d76", // Valid UUIDv4
      firebase_uid: "agent_test_uid",
      email: "agent_test@example.com",
      name: "Agent Test User"
    }
  });

  const ChatService = require('./modules/chat/chat.service').ChatService;
  const chatService = app.get(ChatService);
  const conv = await prisma.conversation.create({ data: { user_id: user.id }});

  const prompts = [
    "Schedule a meeting tomorrow at 5pm",
    "Save this: I like coffee",
    "What do you know about me?",
  ];

  console.log("==================================================");
  console.log(`Starting Agent Behavior Tests for User ID: ${user.id}`);
  console.log("==================================================\n");

  for (const prompt of prompts) {
    console.log(`\n\n--- [USER MESSAGE]: "${prompt}" ---`);
    try {
       const response = await chatService.chat(user.id, { message: prompt, conversation_id: conv.id });
       console.log(`\n[AI RESPONSE]:\n`, JSON.stringify(response, null, 2));
    } catch (e) {
       console.error(`\n[CHAT FLOW CRASHED]:`, e.message || e);
    }
  }

  await app.close();
}

bootstrap().catch(console.error);
