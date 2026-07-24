export { default } from '../index';

export {
	detectForgeProvider,
	runForge,
	listPullRequests,
	showPullRequest,
	getCiStatus,
	listIssues,
	showIssue,
} from '../lib/services/forge';
export { createRelease } from '../lib/services/forge-release';
export { searchCode } from '../lib/services/forge-search';
export {
	buildPrBody,
	commentOnPr,
	createIssue,
	createPr,
	listCommitSubjects,
	readProposalMarkdown,
} from '../lib/services/forge-write';
export type {
	IForgeCheck,
	IForgeCiStatusResult,
	IForgeCiSummary,
	IForgeExec,
	IForgeFailure,
	IForgeIssueComment,
	IForgeIssueDetail,
	IForgeIssueListResult,
	IForgeIssueShowResult,
	IForgeIssueSummary,
	IForgeProvider,
	IForgePrListResult,
	IForgePrShowResult,
	IForgePullRequestDetail,
	IForgePullRequestSummary,
	IForgeWorkflowJob,
	IForgeWorkflowRun,
} from '../lib/contracts/interfaces/forge-read.interface';
export type {
	ICommentPrOptions,
	ICreateIssueOptions,
	ICreatePrOptions,
	IIssueCreateResult,
	IIssueCreateResultData,
	IPrCommentResult,
	IPrCommentResultData,
	IPrCreateResult,
	IPrCreateResultData,
} from '../lib/contracts/interfaces/forge-write.interface';
export type {
	IForgeReleaseExec,
	IForgeReleaseOptions,
	IForgeReleaseResult,
	IForgeReleaseSuccess,
} from '../lib/contracts/interfaces/forge-release.interface';
export type {
	IForgeCodeSearchHit,
	IForgeSearchCodeOptions,
	IForgeSearchCodeResult,
	IForgeSearchCodeSuccess,
	IForgeSearchExec,
} from '../lib/contracts/interfaces/forge-search.interface';

export {
	buildForgeReadToolRegistrations,
	runForgeCiStatus,
	runForgeIssueList,
	runForgeIssueShow,
	runForgePrList,
	runForgePrShow,
} from '../lib/tools/forge-read.tool';
export {
	buildForgeReleaseToolRegistrations,
	runForgeRelease,
} from '../lib/tools/forge-release.tool';
export {
	buildForgeSearchToolRegistrations,
	runForgeSearchCode,
} from '../lib/tools/forge-search.tool';
export {
	buildForgeWriteToolRegistrations,
	runForgeIssueCreate,
	runForgePrComment,
	runForgePrCreate,
} from '../lib/tools/forge-write.tool';
export type {
	IForgeCiStatusArgs,
	IForgeIssueListArgs,
	IForgeIssueShowArgs,
	IForgePrShowArgs,
	IForgeReadToolOptions,
} from '../lib/tools/forge-read.tool';
export type { IForgeReleaseToolOptions } from '../lib/tools/forge-release.tool';
export type { IForgeSearchToolOptions } from '../lib/tools/forge-search.tool';
export type { IForgeWriteToolOptions } from '../lib/tools/forge-write.tool';
