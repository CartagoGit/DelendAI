/**
 * Public surface of `@mcp-vertex/quality`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * runner, scope resolution and tool builder for programmatic reuse.
 */
export { default } from '../index';

export {
	createCommandRunner,
	runScope,
} from './services/runner';
export type {
	ICommandRunner,
	ICommandResult,
	IScopeResult,
	IScopeCommand,
} from './services/runner';
export { resolveScopes } from './services/scopes';
export type { IScopeMap } from './services/scopes';
export {
	evaluateCommandPolicy,
	commandBinary,
} from './services/command-policy';
export type { ICommandPolicy, IPolicyVerdict } from './services/command-policy';
export { buildQualityToolRegistrations } from '../lib/tools';
export type { IQualityToolOptions } from '../lib/tools';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
