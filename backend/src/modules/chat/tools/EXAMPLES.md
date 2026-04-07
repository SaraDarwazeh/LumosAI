/**
 * Tools Layer Usage Examples
 *
 * This file demonstrates how to use the Tools Layer for executing tools.
 */

/**
 * Example 1: Direct Tool Dispatcher Usage
 * 
 * For direct tool execution without going through MCP:
 */
async function example1_directExecution() {
  // Inject ToolDispatcher in your service/controller
  // constructor(private readonly toolDispatcher: ToolDispatcher) {}

  const userId = 'user-123';
  const toolName = 'create_event';
  const input = {
    title: 'Team Standup',
    description: 'Daily engineering standup',
    start_time: '2026-04-07T14:00:00Z',
    end_time: '2026-04-07T14:30:00Z',
  };

  try {
    const result = await this.toolDispatcher.dispatch(userId, toolName, input);
    
    if (result.success) {
      console.log('Event created:', result.data);
      // {
      //   eventId: 'abc123',
      //   htmlLink: 'https://calendar.google.com/calendar/u/0/r/eventedit/...',
      //   summary: 'Team Standup',
      //   start: { dateTime: '2026-04-07T14:00:00Z' },
      //   end: { dateTime: '2026-04-07T14:30:00Z' }
      // }
    }
  } catch (error) {
    console.error('Tool execution failed:', error.message);
  }
}

/**
 * Example 2: Through Tool Service (with MCP fallback)
 * 
 * For tool execution through the ToolService which supports both
 * local tools and MCP tools:
 */
async function example2_toolService() {
  // Inject ToolService in your service/controller
  // constructor(private readonly toolService: ToolService) {}

  const userId = 'user-123';
  const toolName = 'create_event';
  const input = {
    title: 'Product Review',
    description: 'Quarterly product review',
    start_time: '2026-04-08T10:00:00Z',
    end_time: '2026-04-08T11:30:00Z',
  };

  const result = await this.toolService.execute(userId, toolName, input);
  
  // Result structure:
  // {
  //   tool: 'create_event',
  //   output: '{"success":true,"data":{...}}'
  // }

  const parsed = JSON.parse(result.output);
  console.log('Execution result:', parsed);
}

/**
 * Example 3: List Available Tools
 * 
 * Get all available tools including MCP tools:
 */
async function example3_listTools() {
  // Inject ToolService
  // constructor(private readonly toolService: ToolService) {}

  const tools = await this.toolService.listTools();
  
  // Returns array of ToolDefinition objects:
  // [
  //   {
  //     name: 'create_event',
  //     description: 'Create a new event in Google Calendar',
  //     inputSchema: { ... }
  //   },
  //   // ... other tools from MCP
  // ]

  tools.forEach(tool => {
    console.log(`Tool: ${tool.name}`);
    console.log(`Description: ${tool.description}`);
    console.log(`Schema: ${JSON.stringify(tool.inputSchema, null, 2)}`);
  });
}

/**
 * Example 4: Get Tool Definition
 * 
 * Get the schema for a specific tool:
 */
import { getToolDefinition } from './tools/tool.constants';

function example4_getDefinition() {
  const toolDef = getToolDefinition('create_event');
  
  // Returns:
  // {
  //   name: 'create_event',
  //   description: 'Create a new event in Google Calendar',
  //   inputSchema: {
  //     type: 'object',
  //     properties: {
  //       title: { type: 'string', ... },
  //       description: { type: 'string', ... },
  //       start_time: { type: 'string', ... },
  //       end_time: { type: 'string', ... }
  //     },
  //     required: ['title', 'start_time', 'end_time']
  //   }
  // }

  console.log('Tool Schema:');
  console.log(JSON.stringify(toolDef.inputSchema, null, 2));
}

/**
 * Example 5: Chat Integration
 * 
 * How tools are used in the chat flow:
 */
async function example5_chatIntegration() {
  // In your chat service:
  // 1. User sends message: "Create a meeting tomorrow at 3pm about Q2 planning"
  // 2. DecisionService detects action: USE_TOOL
  // 3. Tool name is parsed: "create_event"
  // 4. Parameters are extracted: { title, start_time, end_time, ... }
  // 5. ToolService.execute() is called
  // 6. Result is returned to user

  const userMessage = 'Create a meeting tomorrow at 3pm about Q2 planning';
  const parsedToolRequest = {
    toolName: 'create_event',
    parameters: {
      title: 'Q2 Planning Meeting',
      start_time: '2026-04-08T15:00:00Z',
      end_time: '2026-04-08T16:00:00Z',
    },
  };

  // The chat service would then call:
  // const result = await this.toolService.execute(
  //   userId,
  //   parsedToolRequest.toolName,
  //   parsedToolRequest.parameters
  // );
}

/**
 * Example 6: Error Handling
 * 
 * Proper error handling for tool execution:
 */
async function example6_errorHandling() {
  // Inject ToolDispatcher
  // constructor(private readonly toolDispatcher: ToolDispatcher) {}

  try {
    // Missing required field: start_time
    const result = await this.toolDispatcher.dispatch('user-123', 'create_event', {
      title: 'Meeting',
      // start_time missing!
      end_time: '2026-04-07T15:00:00Z',
    });
  } catch (error) {
    // Catches: BadRequestException with message "Missing required field: start_time"
    console.error('Validation error:', error.message);
  }

  try {
    // Invalid tool name
    const result = await this.toolDispatcher.dispatch('user-123', 'unknown_tool', {});
  } catch (error) {
    // Catches: NotFoundException with message "Tool 'unknown_tool' not found"
    console.error('Tool not found:', error.message);
  }

  try {
    // User has no Google account connected
    const result = await this.toolDispatcher.dispatch('user-123', 'create_event', {
      title: 'Meeting',
      start_time: '2026-04-07T14:00:00Z',
      end_time: '2026-04-07T15:00:00Z',
    });
  } catch (error) {
    // Catches: NotFoundException with message about no Google account
    console.error('Google integration error:', error.message);
  }
}

/**
 * Tool Execution Flow
 * 
 * ┌─────────────────────────────────────────────────────────────┐
 * │                      User Message                            │
 * │                "Create a meeting tomorrow"                  │
 * └──────────────────────┬──────────────────────────────────────┘
 *                        │
 *                        ▼
 * ┌─────────────────────────────────────────────────────────────┐
 * │              DecisionService (Detect Action)                │
 * │                  decision = USE_TOOL                        │
 * └──────────────────────┬──────────────────────────────────────┘
 *                        │
 *                        ▼
 * ┌─────────────────────────────────────────────────────────────┐
 * │         ToolDispatcherService (Parse Tool Request)          │
 * │    toolName = "create_event"                                │
 * │    parameters = { title, start_time, end_time }             │
 * └──────────────────────┬──────────────────────────────────────┘
 *                        │
 *                        ▼
 * ┌─────────────────────────────────────────────────────────────┐
 * │               ToolService.execute()                          │
 * │          Check if local tool or MCP tool                    │
 * └──────────────────────┬──────────────────────────────────────┘
 *                        │
 *        ┌───────────────┴───────────────┐
 *        │                               │
 * ┌──────▼──────────┐          ┌────────▼──────────┐
 * │  Local Tools    │          │    MCP Tools      │
 * │  (create_event) │          │  (other tools)    │
 * │                 │          │                   │
 * │  ToolDispatcher │          │   McpClient       │
 * │  (validates,    │          │   (route to MCP)  │
 * │   executes)     │          │                   │
 * └──────┬──────────┘          └────────┬──────────┘
 *        │                              │
 *        │  GoogleService               │
 *        │  .createCalendarEventForUser │
 *        │                              │
 * └──────┴──────────────────────────────┘
 *        │
 *        ▼
 * ┌─────────────────────────────────────────────────────────────┐
 * │              ToolExecutionResult                            │
 * │  { success: true, data: { eventId, htmlLink, ... } }        │
 * └──────────────────────┬──────────────────────────────────────┘
 *                        │
 *                        ▼
 * ┌─────────────────────────────────────────────────────────────┐
 * │              Return to User                                 │
 * │    "Event created! Link: https://calendar.google.com/..."  │
 * └─────────────────────────────────────────────────────────────┘
 */
