export { default } from '../index';

export {
	detectForgeProvider,
	detectForgeProviderFromRemote,
	readOriginRemoteUrl,
} from '../lib/detect';
export type { IForgeProvider } from '../lib/detect';

export {
	MissingCliError,
	runGh,
	runGlab,
	defaultSpawn,
	redactForgeOutput,
	installHintForCli,
} from '../lib/exec';
export type {
	IForgeExecOptions,
	IForgeExecResult,
	ISpawnLike,
} from '../lib/exec';

export {
	buildPrListCommand,
	buildPrShowCommand,
	buildCiRunsCommand,
	buildCiJobsCommand,
	buildIssueListCommand,
	buildIssueShowCommand,
} from '../lib/cli/cli';

export { parsePrList } from '../lib/parsers/pr-list';
export type { IForgePrListEntry } from '../lib/parsers/pr-list';
export { parsePrShow } from '../lib/parsers/pr-show';
export type {
	IForgePrShow,
	IForgePrCommit,
	IForgePrCheck,
} from '../lib/parsers/pr-show';
export { parseCiStatus } from '../lib/parsers/ci-status';
export type {
	IForgeCiStatus,
	IForgeCiRun,
	IForgeCiJob,
} from '../lib/parsers/ci-status';
export { parseIssueList } from '../lib/parsers/issue-list';
export type { IForgeIssueListEntry } from '../lib/parsers/issue-list';
export { parseIssueShow } from '../lib/parsers/issue-show';
export type {
	IForgeIssueShow,
	IForgeIssueComment,
} from '../lib/parsers/issue-show';

export {
	buildForgeReadToolRegistrations,
	createForgeReadRunner,
} from '../lib/tools/forge-read.tool';
export type {
	IForgeReadBaseParams,
	IForgeReadInput,
	IForgeReadKind,
	IForgeReadToolOptions,
} from '../lib/tools/forge-read.tool';
