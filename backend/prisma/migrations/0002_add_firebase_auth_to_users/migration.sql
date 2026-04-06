-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: 0002_add_firebase_auth_to_users
-- Adds Firebase identity support to users and relaxes nullable name.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE "users" ADD COLUMN "firebase_uid" TEXT;

UPDATE "users"
SET "firebase_uid" = CONCAT('legacy-', "id")
WHERE "firebase_uid" IS NULL;

ALTER TABLE "users"
  ALTER COLUMN "firebase_uid" SET NOT NULL,
  ALTER COLUMN "name" DROP NOT NULL;

DROP INDEX IF EXISTS "users_email_key";
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");
