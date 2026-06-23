/**
 * Public surface of `@mcp-vertex/conventions`.
 *
 * The default export is the plugin (for `--plugins=conventions`). The
 * named exports expose the pure TypeScript profile so downstream
 * tooling can classify paths without going through the MCP layer.
 */
import plugin from '../index';

export default plugin;

export {
	classifyPath,
	TYPESCRIPT_RULES,
	type IRoleRule,
	type Role,
} from '../lib/services/typescript-profile.service';
export {
	scanConventions,
	type IConventionsScanResult,
	type IDirEntry,
	type IDirReader,
} from '../lib/services/conventions-scan.service';
