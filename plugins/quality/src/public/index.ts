/**
 * Public surface of `@delendai/quality`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * runner, scope resolution and tool builder for programmatic reuse.
 */
export { default } from '../index';

export { createCommandRunner, runScope } from '../lib/services/runner';
export type {
	ICommandRunner,
	ICommandResult,
	IScopeResult,
	IScopeCommand,
} from '../lib/services/runner';
export { resolveScopes } from '../lib/services/scopes';
export type { IScopeMap } from '../lib/services/scopes';
// f00386: scoped-vs-full validation decision surface for peer plugins.
export {
	deriveScopedValidationScopes,
	resolveScopedValidationDecision,
} from '../lib/services/scoped-validation.resolver';
export type {
	IScopedValidationDecision,
	IScopedValidationInput,
	IScopedValidationMode,
	IScopedValidationOperation,
} from '../lib/services/scoped-validation.types';
export { runAllScopes } from '../lib/services/run-all';
export type {
	IQualityAllResult,
	IQualityRunAllReport,
} from '../lib/services/run-all';
export {
	evaluateCommandPolicy,
	commandBinary,
} from '../lib/services/command-policy';
export type {
	ICommandPolicy,
	IPolicyVerdict,
} from '../lib/services/command-policy';
export { buildQualityToolRegistrations } from '../lib/tools';
export type { IQualityToolOptions } from '../lib/tools';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
