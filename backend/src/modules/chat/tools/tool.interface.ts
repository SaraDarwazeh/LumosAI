/**
 * Tool Interface and Standards
 * 
 * All tools must implement this interface for consistency
 */

export interface ToolExecutionContext {
  userId: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: string;
}

export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  executionTime?: number;
}

export interface ToolHandler {
  /**
   * Execute the tool
   * @param userId User identifier
   * @param input Tool-specific input
   * @returns Standardized result
   */
  execute(userId: string, input: Record<string, unknown>): Promise<ToolResult>;

  /**
   * Validate user has required permissions/integrations
   * @param userId User identifier
   * @returns true if user can execute this tool
   */
  canExecute(userId: string): Promise<boolean>;

  /**
   * Get reason why user cannot execute tool
   * @param userId User identifier
   * @returns reason string or null if can execute
   */
  getAccessDeniedReason(userId: string): Promise<string | null>;
}

export interface ToolMetadata {
  name: string;
  description: string;
  category: 'calendar' | 'notes' | 'memory' | 'email' | 'other';
  requiredIntegrations?: string[];
  inputSchema: Record<string, unknown>;
}
