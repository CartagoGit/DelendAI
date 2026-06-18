/**
 * Public surface of `@mcp-vertex/quality`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * runner, scope resolution and tool builder for programmatic reuse.
 */
export { default } from '../index';

export {
	createCommandRunner,
	runScope,
} from '../lib/runner';
export type {
	ICommandRunner,
	ICommandResult,
	IScopeResult,
	IScopeCommand,
} from '../lib/runner';
export { resolveScopes } from '../lib/scopes';
export type { IScopeMap } from '../lib/scopes';
export {
	evaluateCommandPolicy,
	commandBinary,
} from '../lib/command-policy';
export type { ICommandPolicy, IPolicyVerdict } from '../lib/command-policy';
export { buildQualityToolRegistrations } from '../lib/tools';
export type { IQualityToolOptions } from '../lib/tools';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
