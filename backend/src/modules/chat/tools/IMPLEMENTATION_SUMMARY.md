/**
 * Complete Tools Layer Implementation - Summary
 * 
 * This document provides an overview of all tool implementations and how they work together
 */

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Tool Service                              │
│  • Lists all tools (local + MCP)                              │
│  • Executes tools via dispatcher/MCP                          │
│  • Initializes all handlers on startup                        │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
   ┌────▼───────────┐         ┌──────▼──────┐
   │ Tool Dispatcher│         │ Tool Service│
   │ • Validates    │         │  (Router)   │
   │ • Routes       │         │             │
   │ • Logs         │         └─────────────┘
   └────┬───────────┘
        │
   ┌────▼─────────────────────────────────┐
   │         Tool Registry                │
   │  Maps tool name -> handler            │
   │  Caches metadata                      │
   └────┬─────────────────────────────────┘
        │
   ┌────┴────────────────────────────────────────────┐
   │                                                  │
┌──▼──────────────┐ ┌──▼─────────┐ ┌──▼────────┐ ┌──▼────────┐
│ Google Calendar │ │ Notes      │ │ Memory    │ │ Email     │
│ • create_event  │ │ • create   │ │ • store   │ │ • send    │
│ • list_events   │ │ • get      │ │ • search  │ │           │
└─────────────────┘ └────────────┘ └───────────┘ └───────────┘
        │                       │            │              │
        ▼                       ▼            ▼              ▼
     GoogleService          PrismaService MemoryClient GoogleService
```

## All Available Tools

### 1. Google Calendar Tools
**Tool Name:** `create_event`
**Purpose:** Create a new event in Google Calendar
**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "description": { "type": "string" },
    "start_time": { "type": "string" },
    "end_time": { "type": "string" }
  },
  "required": ["title", "start_time", "end_time"]
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "eventId": "abc123",
    "htmlLink": "https://calendar.google.com/...",
    "summary": "Team Meeting",
    "start": { "dateTime": "2026-04-07T14:00:00Z" },
    "end": { "dateTime": "2026-04-07T15:00:00Z" },
    "description": "Daily sync"
  },
  "executionTime": 234
}
```
**Requires:** Google OAuth integration

---

**Tool Name:** `list_events`
**Purpose:** List Google Calendar events within a date range
**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "start_date": { "type": "string" },
    "end_date": { "type": "string" },
    "max_results": { "type": "number" }
  },
   "required": ["start_date", "end_date"]
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "count": 3,
    "events": [
      {
        "id": "event1",
        "summary": "Team Meeting",
        "start": { "dateTime": "2026-04-07T14:00:00Z" },
        "end": { "dateTime": "2026-04-07T15:00:00Z" },
        "htmlLink": "..."
      }
    ]
  },
  "executionTime": 345
}
```
**Requires:** Google OAuth integration

---

### 2. Notes Tools
**Tool Name:** `create_note`
**Purpose:** Create a new note
**Input:**
```json
{
  "content": "My important note",
  "title": "Note Title (optional)"
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "id": "note-uuid",
    "content": "My important note",
    "created_at": "2026-04-07T12:00:00Z"
  }
}
```
**Features:**
- Automatically indexed in Qdrant memory
- Associated with user

---

**Tool Name:** `get_notes`
**Purpose:** Retrieve all user notes
**Input:**
```json
{
  "limit": 50
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "count": 12,
    "notes": [
      {
        "id": "note-uuid",
        "content": "Note content",
        "created_at": "2026-04-07T12:00:00Z"
      }
    ]
  }
}
```

---

**Tool Name:** `delete_note`
**Purpose:** Delete a specific note
**Input:**
```json
{
  "note_id": "note-uuid"
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "id": "note-uuid",
    "message": "Note deleted successfully"
  }
}
```

---

### 3. Memory Tools
**Tool Name:** `store_memory`
**Purpose:** Store text as a vector memory in Qdrant
**Input:**
```json
{
  "text": "Important fact to remember",
  "memory_type": "fact"
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "memory_id": "memory-1712504400000-abc123xyz",
    "text": "Important fact to remember",
    "memory_type": "fact",
    "timestamp": "2026-04-07T12:00:00Z"
  }
}
```
**Memory Types:** `fact`, `preference`, `goal`, `habit`

---

**Tool Name:** `search_memory`
**Purpose:** Semantic search through stored memories
**Input:**
```json
{
  "query": "what did I say about meetings?",
  "top_k": 5
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "count": 3,
    "query": "what did I say about meetings?",
    "results": [
      {
        "id": "memory-1712504400000-abc123xyz",
        "text": "Important fact about meetings",
        "score": 0.92,
        "type": "message",
        "timestamp": "2026-04-07T12:00:00Z",
        "metadata": {
          "memory_type": "fact",
          "importance": 0.7
        }
      }
    ]
  }
}
```

---

### 4. Email Tools
**Tool Name:** `send_email`
**Purpose:** Send email via Gmail API
**Input:**
```json
{
  "to": "recipient@example.com",
  "subject": "Meeting Tomorrow",
  "body": "<h1>Hello</h1><p>Let's meet tomorrow at 3pm</p>",
  "cc": "manager@company.com",
  "bcc": "archive@company.com"
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "18abc123xyz",
    "to": "recipient@example.com",
    "subject": "Meeting Tomorrow",
    "timestamp": "2026-04-07T12:00:00Z"
  }
}
```
**Features:**
- HTML email support
- CC/BCC support
- Requires Gmail scope in Google OAuth

---

## Implementation Details

### Handler Pattern
Each tool implements `ToolHandler` interface:

```typescript
interface ToolHandler {
  execute(userId: string, input: Record<string, unknown>): Promise<ToolResult>;
  canExecute(userId: string): Promise<boolean>;
  getAccessDeniedReason(userId: string): Promise<string | null>;
}
```

### Tool Result Standard
All tools return:

```typescript
interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  executionTime?: number;
}
```

### Permission Chain
1. **Tool Dispatcher** - Validates input schema
2. **Handler** - Checks `canExecute(userId)`
3. **Handler** - Returns access denied reason if needed
4. **Handler** - Executes tool
5. **ToolService** - Logs execution

### Error Handling

| Error Type | Status | Response |
|------------|--------|----------|
| Tool not found | 404 | `"Tool 'xyz' not found"` |
| Invalid input | 400 | `"Missing required field: xyz"` |
| Permission denied | 403 | `"No Google account connected"` |
| Execution error | 500 | `"Failed to create event: ..."` |

---

## Usage Examples

### 1. Create Google Calendar Event
```bash
POST /tools/execute
{
  "toolName": "create_event",
  "input": {
    "title": "Team Meeting",
    "description": "Quarterly sync",
    "start_time": "2026-04-07T14:00:00Z",
    "end_time": "2026-04-07T15:00:00Z"
  }
}
```

### 2. Create and Search Notes
```bash
# Create note
POST /tools/execute
{
  "toolName": "create_note",
  "input": {
    "content": "Remember to follow up with product team about Q2 roadmap"
  }
}

# Search notes
POST /tools/execute
{
  "toolName": "search_memory",
  "input": {
    "query": "Q2 roadmap discussion",
    "top_k": 5
  }
}
```

### 3. Send Email
```bash
POST /tools/execute
{
  "toolName": "send_email",
  "input": {
    "to": "team@company.com",
    "subject": "Action Items from Today",
    "body": "<h2>Hi Team</h2><p>Here are the action items...</p>"
  }
}
```

### 4. List All Tools
```bash
POST /tools/list
```

### 5. Get Tool Schema
```bash
POST /tools/schema
{
  "toolName": "create_event"
}
```

---

## Integration with Chat System

When user says: "Create a meeting tomorrow at 3pm about Q2 planning"

1. **Chat receives message**
2. **Decision Service detects:** `USE_TOOL` action
3. **Tool Parser extracts:**
   ```json
   {
     "toolName": "create_event",
     "parameters": {
       "title": "Q2 planning",
       "start_time": "2026-04-08T15:00:00Z",
       "end_time": "2026-04-08T16:00:00Z"
     }
   }
   ```
4. **ToolService.execute()** called
5. **ToolDispatcher.dispatch()** invoked
6. **GoogleCalendarTools.createEventHandler()** executes
7. **GoogleService.createCalendarEventForUser()** called
8. **Google Calendar API** creates event
9. **ToolResult returned** to chat
10. **Chat formats response:** "Created event 'Q2 planning' for tomorrow at 3pm"

---

## Files Created/Modified

Created:
- `tool.interface.ts` - Tool handler interface
- `tool.registry.ts` - Tool handler registry
- `tool.constants.ts` - Tool definitions (updated)
- `tool.dispatcher.ts` - Dispatcher with registry pattern
- `google-calendar.handler.ts` - Google Calendar tools
- `notes.handler.ts` - Notes tools
- `memory.handler.ts` - Memory/Qdrant tools
- `email.handler.ts` - Email/Gmail tools
- `tools.controller.ts` - Test endpoints
- `index.ts` - Exports (updated)

Modified:
- `tool.service.ts` - Registry initialization, all handlers
- `chat.module.ts` - New providers

---

## Next Steps

1. **Verify build** 
```bash
docker compose exec backend npm run build
```

2. **Test endpoints**
```bash
# Get auth token first
# Then test tool execution
curl -X POST http://localhost:3000/tools/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

3. **Integrate with chat** - Use ToolService in chat.service.ts

4. **Add more tools** - Follow same pattern

---

## Production Readiness Checklist

- ✅ All tools standardized output
- ✅ Permission/access control
- ✅ Input validation
- ✅ Error handling
- ✅ Logging
- ✅ Execution timing
- ✅ Handler registry
- ✅ Clean separation of concerns
- ✅ Type safety
- ✅ Documentation
