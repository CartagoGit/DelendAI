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

export {
	buildForgeReadToolRegistrations,
	runForgeCiStatus,
	runForgeIssueList,
	runForgeIssueShow,
	runForgePrList,
	runForgePrShow,
} from '../lib/tools/forge-read.tool';
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
export type { IForgeWriteToolOptions } from '../lib/tools/forge-write.tool';
