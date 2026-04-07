/**
 * Tools Layer Architecture
 *
 * This document describes the Tools Layer architecture and its role in the system.
 */

## Overview

The Tools Layer is a modular, extensible system for executing actions like creating Google Calendar events. It's designed to be independent from the chat system while remaining easily integrable.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Chat Flow                              │
│  (User message → Decision → Plan → Tool Execution)         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │ Tool Service │ (tool.service.ts)
                  │              │ • Lists available tools
                  │              │ • Routes tool execution
                  │              │ • Handles MCP fallback
                  └──────┬───────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
    ┌────▼──────────┐             ┌─────▼──────────┐
    │ Local Tools   │             │  MCP Tools     │
    │ (Custom impl) │             │  (External)    │
    └────┬──────────┘             └────┬───────────┘
         │                             │
    ┌────▼──────────────┐             │
    │ Tool Dispatcher   │             │
    │ (tool.dispatcher) │             │
    │                  │             │
    │ • Validation      │             │
    │ • Routing         │             │
    │ • Execution       │             │
    └────┬──────────────┘             │
         │                             │
    ┌────▼──────────────────────────┐  │
    │  Google Service Module        │  │
    │  (Google Calendar, etc)       │  │
    │                               │  │
    │  createCalendarEventForUser() │  │
    └───────────────────────────────┘  │
                                        │
                                   ┌────▼────────┐
                                   │ MCP Client  │
                                   └─────────────┘
```

## Components

### 1. Tool Definitions (`tool.constants.ts`)

**Purpose**: Define all available tools with schemas

**Contents**:
- `TOOL_DEFINITIONS` - Object containing all tool definitions
- `ToolName` - Type for valid tool names
- `isValidToolName()` - Validation function
- `getToolDefinition()` - Retrieves tool schema

**Usage**:
```typescript
import { TOOL_DEFINITIONS, isValidToolName } from './tool.constants';

if (isValidToolName('create_event')) {
  // Tool exists
}

const schema = TOOL_DEFINITIONS.create_event.inputSchema;
```

### 2. Tool Dispatcher (`tool.dispatcher.ts`)

**Purpose**: Execute tools with validation and clean response

**Key Methods**:
- `dispatch(userId, toolName, input)` - Main execution method
- `validateInput(toolName, input)` - Schema validation
- `handleCreateEvent(userId, input)` - Google Calendar handler
- `getAvailableTools()` - List all native tools
- `getToolDefinition(toolName)` - Get specific tool schema

**Response Format**:
```typescript
interface ToolExecutionResult {
  success: boolean;
  data?: Record<string, unknown>;  // On success
  error?: string;  // On failure
}
```

**Error Handling**:
- `NotFoundException` - Tool not found
- `BadRequestException` - Validation failed
- `Error` - Execution failed (from Google API, etc)

### 3. Tool Service (`tool.service.ts`)

**Purpose**: Orchestrate tool execution and integrate with MCP

**Key Methods**:
- `execute(userId, toolName, input)` - Main public method
- `listTools()` - Get all available tools (local + MCP)

**Integration Points**:
- Routes local tools through `ToolDispatcher`
- Falls back to `McpClient` for unknown tools
- Caches tool definitions

**Response Format**:
```typescript
interface ToolExecutionResult {
  tool: string;
  output: string;  // JSON serialized
}
```

### 4. Supporting Services

**GoogleService** (`../google/google.service.ts`):
- `createCalendarEventForUser(userId, event)` - Creates Google Calendar events
- Handles token refresh automatically
- Returns calendar event object

**McpClient** (`../../clients/mcp.client.ts`):
- Routes execution to MCP server
- For external/custom tools
- Fallback for unknown tools

## Adding New Tools

### Step 1: Define Tool Schema

Edit `tools/tool.constants.ts`:

```typescript
export const TOOL_DEFINITIONS = {
  // ... existing tools
  send_email: {
    name: 'send_email',
    description: 'Send an email',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
} as const;
```

### Step 2: Add Handler

Edit `tools/tool.dispatcher.ts`:

```typescript
async dispatch(userId: string, toolName: string, input: ToolInput) {
  // ... validation ...
  
  switch (toolName) {
    case 'create_event':
      return await this.handleCreateEvent(userId, input);
    case 'send_email':
      return await this.handleSendEmail(userId, input);  // NEW
    default:
      throw new NotFoundException(`No handler for tool '${toolName}'`);
  }
}

private async handleSendEmail(userId: string, input: ToolInput): Promise<ToolExecutionResult> {
  // Implementation here
  // Inject EmailService in constructor
  // Call emailService.send()
  // Return structured result
}
```

### Step 3: Update Module

Add any new service dependencies to `chat.module.ts`:

```typescript
@Module({
  providers: [
    // ... existing
    ToolDispatcher,
    EmailService,  // NEW if needed
  ],
})
```

## Tool Execution Flow

1. **User Message** → "Create a meeting tomorrow at 3pm"
2. **Decision Service** → Detects `USE_TOOL` action
3. **ToolDispatcherService** → Parses: `{ toolName: 'create_event', parameters: {...} }`
4. **ChatService** → Calls `toolService.execute(userId, 'create_event', parameters)`
5. **ToolService.execute()** → Checks if local or MCP tool
6. **Local Tool** → Routes to `toolDispatcher.dispatch()`
7. **ToolDispatcher** → Validates input, routes to handler
8. **Handler** → Executes (e.g., calls GoogleService)
9. **Result** → Returned to chat for response generation

## Security

- **Required**: All tool execution requires authenticated `userId`
- **Validation**: Input validated against schema
- **Authorization**: User must have connected Google account (for create_event)
- **Isolation**: Each user's tools operate on their own data

## Error Handling

Tools return structured errors:

```typescript
// Success
{ success: true, data: { eventId: '123', ... } }

// Validation error
{ success: false, error: 'Missing required field: start_time' }

// Execution error  
{ success: false, error: 'Failed to create Google Calendar event: ...' }
```

## Testing Tool Execution

Direct execution (bypassing chat):

```bash
# Via curl (if exposed through controller)
curl -X POST http://localhost:3000/chat/execute-tool \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "create_event",
    "parameters": {
      "title": "Test Event",
      "start_time": "2026-04-07T14:00:00Z",
      "end_time": "2026-04-07T15:00:00Z"
    }
  }'
```

Or in TypeScript:

```typescript
const result = await toolDispatcher.dispatch(
  userId,
  'create_event',
  {
    title: 'Test Event',
    start_time: '2026-04-07T14:00:00Z',
    end_time: '2026-04-07T15:00:00Z',
  }
);
```

## Future Enhancements

1. **Async Execution** - Long-running tools without blocking
2. **Tool Chaining** - One tool's output feeds another's input
3. **Permissions** - Per-user permission control for tools
4. **Monitoring** - Tool execution metrics and logging
5. **Caching** - Cache tool results when appropriate
6. **Conditional Tools** - Tools available based on conditions
7. **Tool Groups** - Organize tools by category
