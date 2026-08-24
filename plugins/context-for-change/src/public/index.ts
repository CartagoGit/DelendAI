/**
 * Public surface of `@mcp-vertex/context-for-change`. The default export
 * (in `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * context builder + tool registrations for programmatic reuse.
 */
export { default } from '../index';

export {
	buildContextForChangeToolRegistrations,
	ContextForChangeOutputSchema,
	runContextForChange,
} from '../lib/tools/context-for-change.tool';
export type {
	IContextForChangeOutput,
	IContextForChangePluginOptions,
	IContextForChangeSection,
	IContextForChangeToolArgs,
	IContextForChangeToolOptions,
	TContextForChangeSource,
} from '../lib/contracts/interfaces/context-for-change.interface';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
