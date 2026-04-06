-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: 0001_init
-- Creates all Lumos tables from scratch.
-- Run automatically via: prisma migrate deploy
-- ──────────────────────────────────────────────────────────────────────────────

-- Enums
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'doing', 'done');
CREATE TYPE "Priority" AS ENUM ('low', 'medium', 'high');
CREATE TYPE "ReminderType" AS ENUM ('notification', 'alarm', 'external');
CREATE TYPE "ReminderStatus" AS ENUM ('pending', 'sent');
CREATE TYPE "IdeaStatus" AS ENUM ('idea', 'exploring', 'building', 'done');
CREATE TYPE "AttachedToType" AS ENUM ('task', 'idea', 'none');

-- Users
CREATE TABLE "users" (
    "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "email"      TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Tasks
CREATE TABLE "tasks" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"         TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "description"     TEXT,
    "status"          "TaskStatus" NOT NULL DEFAULT 'todo',
    "due_date"        TIMESTAMP(3),
    "priority"        "Priority" NOT NULL DEFAULT 'medium',
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    "last_checked_at" TIMESTAMP(3),
    "completed_at"    TIMESTAMP(3),
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Labels
CREATE TABLE "labels" (
    "id"      TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id" TEXT NOT NULL,
    "name"    TEXT NOT NULL,
    "color"   TEXT NOT NULL,
    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "labels" ADD CONSTRAINT "labels_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TaskLabels (many-to-many join)
CREATE TABLE "task_labels" (
    "task_id"  TEXT NOT NULL,
    "label_id" TEXT NOT NULL,
    CONSTRAINT "task_labels_pkey" PRIMARY KEY ("task_id", "label_id")
);
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_label_id_fkey"
    FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reminders
CREATE TABLE "reminders" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "task_id"      TEXT,
    "type"         "ReminderType" NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status"       "ReminderStatus" NOT NULL DEFAULT 'pending',
    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ideas
CREATE TABLE "ideas" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"     TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "status"      "IdeaStatus" NOT NULL DEFAULT 'idea',
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Notes
CREATE TABLE "notes" (
    "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"          TEXT NOT NULL,
    "content"          TEXT NOT NULL,
    "attached_to_type" "AttachedToType" NOT NULL DEFAULT 'none',
    "attached_to_id"   TEXT,
    "task_id"          TEXT,
    "idea_id"          TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_idea_id_fkey"
    FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrations
CREATE TABLE "integrations" (
    "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"       TEXT NOT NULL,
    "provider"      TEXT NOT NULL,
    "access_token"  TEXT NOT NULL,
    "refresh_token" TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "integrations_user_id_provider_key" ON "integrations"("user_id", "provider");
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Activity Logs
CREATE TABLE "activity_logs" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"     TEXT NOT NULL,
    "action"      TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id"   TEXT NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
