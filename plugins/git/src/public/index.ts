/**
 * Public surface of `@cartago-git/mcp-git`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * git helpers + tool builder for programmatic reuse.
 */
export { default } from '../index';

export {
	createGitRunner,
	isGitRepo,
	parseStatus,
	parseLog,
	gitStatus,
	gitChanged,
	gitDiffStat,
	gitLog,
} from '../lib/git';
export type {
	IGitRunner,
	IGitStatus,
	IGitStatusEntry,
	IGitCommit,
} from '../lib/git';
export { buildGitToolRegistrations } from '../lib/tools';
export type { IGitToolOptions } from '../lib/tools';
