/**
 * Public surface of `@delendai/issues-triage`. The default export
 * (in `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes
 * only the pure data contracts and helpers for programmatic reuse and
 * tests. The plugin itself is internal-only (private package).
 */
export { default } from '../index';

export { AUTOMATED_NOTICE, withBotNotice } from '../lib/bot-notice.constant';

export {
	analyzeIssue,
	kindForCategory,
	titleForIssue,
} from '../lib/analysis.helper';
export type {
	ITriageAnalysis,
	TriageCategory,
	TriageSeverity,
} from '../lib/contracts/interfaces/analysis.interface';

export { buildProposalDraft } from '../lib/proposal-draft.builder';
export type { IBuildProposalDraftInput } from '../lib/contracts/interfaces/proposal-draft.interface';

export { BOT_REPLY_MARKER } from '../lib/contracts/constants/github.constant';
export {
	addComment,
	addLabels,
	fetchIssue,
	ghExec,
	listOpenIssues,
} from '../lib/github.service';
export type {
	ICommentResult,
	IGhExec,
	IGhResult,
	ITriageIssueDetail,
	ITriageIssueSummary,
} from '../lib/contracts/interfaces/github.interface';
