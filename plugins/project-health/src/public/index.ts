/**
 * Public surface of `@delendai/project-health`. The default export
 * (in `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes
 * the tool builder, output schema and types for programmatic reuse.
 */
export { default } from '../index';

export {
	buildProjectHealthToolRegistrations,
	ProjectHealthOutputSchema,
	runProjectHealth,
} from '../lib/tools/project-health.tool';
export type {
	IProjectHealthNextAction,
	IProjectHealthOutput,
	IProjectHealthPluginOptions,
	IProjectHealthScore,
	IProjectHealthSummary,
	IProjectHealthToolArgs,
	IProjectHealthToolOptions,
	TProjectHealthDomain,
} from '../lib/contracts/interfaces/project-health.interface';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
