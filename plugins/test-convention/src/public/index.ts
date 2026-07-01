/**
 * Public surface of `@mcp-vertex/test-convention`.
 *
 * Re-exports the convention types + helpers and the scan engine so
 * other plugins (or the web site) can render or audit conventions
 * without importing the plugin entry (`src/index.ts`), which has side
 * effects through `definePlugin`.
 */

export {
	DEFAULT_CONVENTION,
	effectiveMockStyle,
	mergeConvention,
} from '../convention';
export type {
	ICoverageThreshold,
	ITestConvention,
	MockStyle,
	SpecLayout,
} from '../convention';

export { suggestSpecPath } from '../suggest';
export type { ISuggestResult } from '../suggest';

export { scanDrift } from '../scan';
export type {
	IDrift,
	IDriftCounts,
	IDriftReport,
	IScanOptions,
	Severity,
} from '../scan';

export { detectRunner } from '../lib/runners';
export type { IRunnerInfo, RunnerName } from '../lib/runners';

export {
	renderCoverageMarkdown,
	renderOverviewMarkdown,
	renderRunnersMarkdown,
} from '../lib/knowledge';

export { default } from '../index';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
