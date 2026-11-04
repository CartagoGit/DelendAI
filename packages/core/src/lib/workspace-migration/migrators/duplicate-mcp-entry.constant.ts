/**
 * duplicate-mcp-entry.constant.ts — the one MCP entry per host migration.
 */

/** Stable id recorded in the journal. */
export const DUPLICATE_MCP_ENTRY_MIGRATOR_ID = 'duplicateMcpEntryMigrator:v1';

/** The file VS Code reads, and the one Claude Code reads that VS Code loads too. */
export const VSCODE_MCP_FILE = '.vscode/mcp.json';
export const PROJECT_MCP_FILE = '.mcp.json';
