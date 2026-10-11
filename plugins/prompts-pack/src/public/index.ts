export { buildGenerateDocstringsPrompt } from '../prompts/docstrings';
export type { IGenerateDocstringsArgs } from '../prompts/docstrings';
export { buildExplainThisCodePrompt } from '../prompts/explain';
export type { IExplainThisCodeArgs } from '../prompts/explain';
export { buildOptimizeThisPrompt } from '../prompts/optimize';
export type { IOptimizeThisArgs } from '../prompts/optimize';
export { buildReviewThisDiffPrompt } from '../prompts/review-diff';
export type { IReviewThisDiffArgs } from '../prompts/review-diff';
export { buildSecurityAuditThisFilePrompt } from '../prompts/security-audit';
export type { ISecurityAuditThisFileArgs } from '../prompts/security-audit';
export type {
	IPromptArgumentSpec,
	ITemplatedPromptRegistration,
} from '../prompts/shared';
export { buildWriteTestsForPrompt } from '../prompts/write-tests';
export type { IWriteTestsForArgs } from '../prompts/write-tests';
