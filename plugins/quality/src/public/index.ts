/**
 * Public surface of `@mcp-vertex/quality`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * runner, scope resolution and tool builder for programmatic reuse.
 */
export { default } from '../index';

export {
	createCommandRunner,
	runScope,
} from '../lib/services/runner';
export type {
	ICommandRunner,
	ICommandResult,
	IScopeResult,
	IScopeCommand,
} from '../lib/services/runner';
export { resolveScopes } from '../lib/services/scopes';
export type { IScopeMap } from '../lib/services/scopes';
export {
	evaluateCommandPolicy,
	commandBinary,
} from '../lib/services/command-policy';
export type {
	ICommandPolicy,
	IPolicyVerdict,
} from '../lib/services/command-policy';
export { buildQualityToolRegistrations } from './lib/tools/tools';
export type { IQualityToolOptions } from './lib/tools/tools';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
