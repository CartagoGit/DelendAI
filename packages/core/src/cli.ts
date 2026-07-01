#!/usr/bin/env node
import { runCli } from './lib/cli/assemble';

/**
 * Backward-compatible MCP server entrypoint.
 *
 * The human-facing `mcp-vertex` / `mcpv` binaries live in
 * `@mcp-vertex/cli`; this file stays available for hosts that still
 * start the core MCP server entry directly.
 */
export {
	assembleCliConfig,
	runCli,
} from './lib/cli/assemble';
export type {
	IAssembleCliDeps,
	IAssembledCliConfig,
} from './lib/cli/assemble';

if (import.meta.main) {
	void runCli(process.argv.slice(2), process.cwd());
}
