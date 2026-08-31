/**
 * Public surface of `@mcp-vertex/git`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * git helpers + tool builder for programmatic reuse.
 */
export { default } from '../index';

export {
	createGitRunner,
	checkRepo,
	parseStatus,
	parseLog,
	parseBlamePorcelain,
	parseWorktreeList,
	gitStatus,
	gitChanged,
	gitDiffStat,
	gitLog,
	gitBlame,
	gitShow,
	gitWorktreeList,
	resolveReleaseCycleConfig,
	prepareReleaseBranch,
	mergeReleaseFixToIntegration,
	rehydrateIntegrationFromRelease,
	openPromotionPr,
	createReleaseCandidate,
} from '../lib/services/git';
export type {
	IGitRunner,
	IGitRunResult,
	IRepoCheck,
	IGitStatus,
	IGitStatusEntry,
	IGitCommit,
	IGitBlameLine,
	IGitBlameResult,
	IGitShowDetail,
	IGitShowResult,
	IGitWorktreeEntry,
} from '../lib/services/git';
export type {
	IPreparedReleaseBranch,
	IPrepareReleaseBranchInput,
} from '../lib/contracts/interfaces/prepared-release-branch.interface';
export { DEFAULT_RELEASE_CYCLE_CONFIG } from '../lib/contracts/interfaces/release-cycle.interface';
export type {
	IMergeReleaseFixInput,
	IRehydrateIntegrationInput,
	IPromotionReady,
	IIntegrationRehydrated,
	IReleaseCycleConfig,
	IReleaseFixMerged,
} from '../lib/contracts/interfaces/release-cycle.interface';
export { buildGitToolRegistrations } from '../lib/tools';
export type { IGitToolOptions } from '../lib/tools';
export {
	buildGitWriteToolRegistrations,
	isConventionalCommitMessage,
} from '../lib/tools/write-tools';
export type { IGitWriteToolOptions } from '../lib/tools/write-tools';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
