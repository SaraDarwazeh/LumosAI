# Lumos Backend

> Clean, Docker-based foundation for the Lumos productivity application.
> **No business logic — infrastructure and scaffold only.**

---

## Stack

| Layer | Technology |
|---|---|
| Framework | [NestJS](https://nestjs.com/) v10 |
| Language | TypeScript 5 |
| ORM | [Prisma](https://www.prisma.io/) v5 |
| Database | PostgreSQL 15 |
| Orchestration | Docker Compose v3.8 |
| DB Admin UI | pgAdmin 4 |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- No Node.js installation required locally (everything runs inside Docker)

---

## Quick Start

```bash
# 1. Clone / enter the project
cd lumos

# 2. Copy .env (already done — it's pre-filled for local dev)
#    If starting fresh:
cp .env.example .env

# 3. Build images and start all services
docker compose up --build

# 4. Watch for this log line in the backend output:
#    🚀 Lumos backend running on http://localhost:3000
```

That's it. On first run, Prisma will automatically apply the `0001_init` migration and create all tables.

---

## Services

| Service | URL | Credentials |
|---|---|---|
| Backend API | http://localhost:3000 | — |
| pgAdmin | http://localhost:5050 | `admin@lumos.dev` / `admin` |
| PostgreSQL | `localhost:5432` | `lumos_user` / `lumos_pass` |

### Connecting pgAdmin to PostgreSQL

1. Open http://localhost:5050
2. Login with credentials above
3. Right-click **Servers → Register → Server**
4. **General tab**: Name = `Lumos`
5. **Connection tab**:
   - Host: `postgres` *(the Docker service name)*
   - Port: `5432`
   - Database: `lumos`
   - Username: `lumos_user`
   - Password: `lumos_pass`
6. Click Save ✓

---

## Useful Commands

```bash
# Start services (detached)
docker compose up -d

# Stop all services
docker compose down

# Stop and remove volumes (wipes DB data!)
docker compose down -v

# View backend logs
docker compose logs -f backend

# Run Prisma migrations manually inside container
docker compose exec backend npx prisma migrate deploy

# Open Prisma Studio (GUI for the DB)
docker compose exec backend npx prisma studio
# Then open http://localhost:5555

# Generate Prisma client after schema changes
docker compose exec backend npx prisma generate

# Create a new migration (after editing schema.prisma)
docker compose exec backend npx prisma migrate dev --name <migration_name>

# Run a shell inside the backend container
docker compose exec backend sh
```

---

## Project Structure

```
lumos/
├── docker-compose.yml          ← Service orchestration
├── .env                        ← Local environment variables
├── .env.example                ← Template to commit to git
├── .gitignore
│
└── backend/
    ├── Dockerfile              ← Node 20 Alpine image
    ├── package.json
    ├── tsconfig.json
    ├── nest-cli.json
    │
    ├── prisma/
    │   ├── schema.prisma       ← Full data model (source of truth)
    │   └── migrations/
    │       ├── migration_lock.toml
    │       └── 0001_init/
    │           └── migration.sql
    │
    └── src/
        ├── main.ts             ← App bootstrap
        ├── app.module.ts       ← Root NestJS module
        │
        ├── config/
        │   └── database.config.ts
        │
        ├── database/
        │   ├── database.module.ts   ← Global @Module providing PrismaService
        │   └── prisma.service.ts    ← PrismaClient with lifecycle hooks
        │
        └── modules/            ← Domain modules (scaffolded — no logic yet)
            ├── tasks/
            ├── notes/
            ├── ideas/
            ├── labels/
            ├── reminders/
            ├── integrations/
            └── activity-logs/
```

---

## Data Model

```
User ──< Task ──< TaskLabel >── Label
          │
          ├──< Reminder
          └──< Note

User ──< Idea ──< Note

User ──< Integration
User ──< ActivityLog
```

### Entities

| Model | Key Fields |
|---|---|
| `User` | id (uuid), email (unique), name, created_at |
| `Task` | id, user_id FK, title, status (todo/doing/done), priority, due_date, completed_at |
| `Label` | id, user_id FK, name, color |
| `TaskLabel` | (task_id, label_id) composite PK |
| `Reminder` | id, task_id FK nullable, type, scheduled_at, status |
| `Idea` | id, user_id FK, title, status (idea/exploring/building/done) |
| `Note` | id, user_id FK, content, attached_to_type, task_id/idea_id FK nullable |
| `Integration` | id, user_id FK, provider (unique per user), access_token |
| `ActivityLog` | id, user_id FK, action, entity_type, entity_id |

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `POSTGRES_DB` | Database name | `lumos` |
| `POSTGRES_USER` | DB username | `lumus_user` |
| `POSTGRES_PASSWORD` | DB password | `lumos_pass` |
| `DATABASE_URL` | Prisma connection string | See .env |
| `PORT` | Backend HTTP port | `3000` |
| `PGADMIN_EMAIL` | pgAdmin login email | `admin@lumos.dev` |
| `PGADMIN_PASSWORD` | pgAdmin login password | `admin` |

---

## What's Next

This foundation is ready for:

- [ ] Authentication module (JWT / OAuth)
- [ ] REST API endpoints per domain module
- [ ] AI agent integration layer
- [ ] MCP tools layer
- [ ] Vector database (pgvector or Pinecone)
- [ ] WebSocket support for real-time updates

---

## Troubleshooting

**Backend exits immediately?**
Postgres might not be ready. The `depends_on: condition: service_healthy` should handle this,
but if it fails: `docker compose restart backend`

**Prisma migration fails?**
Check `DATABASE_URL` in `.env`. Inside Docker, the host must be `postgres` (the service name), not `localhost`.

**Port already in use?**
```bash
# Find what's using port 3000
lsof -i :3000
# Kill it or change the HOST port in docker-compose.yml
```
