/**
 * Tool Definitions
 *
 * This file defines all available tools in the system.
 * Each tool includes:
 * - name: Unique identifier
 * - description: Human-readable description
 * - category: Tool category for organization
 * - inputSchema: JSON Schema for input validation
 */

export const TOOL_DEFINITIONS = {
  // ────────────────────────── Google Calendar ──────────────────────────
  create_event: {
    name: 'create_event',
    description: 'Create a new event in Google Calendar',
    category: 'calendar',
    requiredIntegrations: ['google_oauth'],
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Event title',
        },
        description: {
          type: 'string',
          description: 'Event description (optional)',
        },
        start_time: {
          type: 'string',
          description: 'Event start time in ISO 8601 format (e.g., 2026-04-07T14:00:00Z)',
        },
        end_time: {
          type: 'string',
          description: 'Event end time in ISO 8601 format (e.g., 2026-04-07T15:00:00Z)',
        },
      },
      required: ['title', 'start_time', 'end_time'],
    },
  },

  list_events: {
    name: 'list_events',
    description: 'List Google Calendar events within a date range',
    category: 'calendar',
    requiredIntegrations: ['google_oauth'],
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in ISO 8601 format (e.g., 2026-04-01T00:00:00Z)',
        },
        end_date: {
          type: 'string',
          description: 'End date in ISO 8601 format (e.g., 2026-04-30T23:59:59Z)',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of events to return (default: 10)',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },

  // ────────────────────────── Notes System ──────────────────────────
  create_note: {
    name: 'create_note',
    description: 'Create a new note',
    category: 'notes',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Note title',
        },
        content: {
          type: 'string',
          description: 'Note content',
        },
      },
      required: ['content'],
    },
  },

  get_notes: {
    name: 'get_notes',
    description: 'Retrieve all user notes',
    category: 'notes',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of notes to return (default: 50)',
        },
      },
    },
  },

  delete_note: {
    name: 'delete_note',
    description: 'Delete a specific note',
    category: 'notes',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: {
          type: 'string',
          description: 'ID of the note to delete',
        },
      },
      required: ['note_id'],
    },
  },

  // ────────────────────────── Memory (Qdrant) ──────────────────────────
  store_memory: {
    name: 'store_memory',
    description: 'Store text as a memory vector in Qdrant',
    category: 'memory',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to store as memory',
        },
        memory_type: {
          type: 'string',
          enum: ['fact', 'preference', 'goal', 'habit'],
          description: 'Type of memory',
        },
      },
      required: ['text'],
    },
  },

  search_memory: {
    name: 'search_memory',
    description: 'Semantic search through stored memories',
    category: 'memory',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        top_k: {
          type: 'number',
          description: 'Number of results to return (default: 5)',
        },
      },
      required: ['query'],
    },
  },

  // ────────────────────────── Email ──────────────────────────
  send_email: {
    name: 'send_email',
    description: 'Send an email via Gmail API',
    category: 'email',
    requiredIntegrations: ['google_oauth'],
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address',
        },
        subject: {
          type: 'string',
          description: 'Email subject',
        },
        body: {
          type: 'string',
          description: 'Email body (HTML or plain text)',
        },
        cc: {
          type: 'string',
          description: 'CC recipient (optional)',
        },
        bcc: {
          type: 'string',
          description: 'BCC recipient (optional)',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
} as const;

export type ToolName = keyof typeof TOOL_DEFINITIONS;

export function isValidToolName(name: string): name is ToolName {
  return name in TOOL_DEFINITIONS;
}

export function getToolDefinition(name: ToolName) {
  return TOOL_DEFINITIONS[name];
}
