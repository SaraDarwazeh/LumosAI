-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: 0003_add_conversations_and_messages
-- Adds persistent chat conversations and messages for AI context.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant');

CREATE TABLE "conversations" (
    "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"    TEXT NOT NULL,
    "title"      TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "conversations_user_id_created_at_idx"
    ON "conversations"("user_id", "created_at");

CREATE TABLE "messages" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "conversation_id" TEXT NOT NULL,
    "role"            "MessageRole" NOT NULL,
    "content"         TEXT NOT NULL,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "messages_conversation_id_created_at_idx"
    ON "messages"("conversation_id", "created_at");
