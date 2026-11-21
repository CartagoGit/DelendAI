/**
 * libs/mcp-project/src/lib/proposals/index.ts
 *
 * Public barrel for the proposals module. T2 and T3 import from here;
 * they must NOT import directly from the implementation files.
 *
 * NOTE: `server.ts` is NOT imported here. That connection belongs to T3.
 */

export { extractYamlBlock, parseFrontmatterBlock } from './frontmatter-parser';
export type { IYamlValue } from './frontmatter-parser';

export { ProposalParseError } from './proposal-errors';
export type { IProposalErrorCode } from './proposal-errors';

export { parseProposalDocument } from './proposal-document';
export type {
	IAcceptanceCriterion,
	IExpectLiteral,
	IExpectValue,
	IOwnershipEntry,
	IPlanChild,
	IPlanClosureGate,
	IPlanContains,
	IProposalBody,
	IProposalDocument,
	IProposalFrontmatter,
} from './proposal-document';

export { validateBudget } from './proposal-budget';
export type {
	IBudgetValidationResult,
	IBudgetViolation,
	IBudgetViolationSeverity,
	IObservedUsage,
	IProposalBudget,
} from './proposal-budget';

export { runAcceptanceCriteria } from './proposal-acceptance';
export type {
	IAcceptanceResult,
	IAcceptanceRunResult,
} from './proposal-acceptance';

export {
	evaluateParallelism,
	extractParallelismFromFrontmatter,
} from './proposal-parallelism';
export type {
	IParallelismResult,
	IParallelismViolation,
	IParallelismViolationSeverity,
	IProposalParallelism,
	IProposalTrack,
} from './proposal-parallelism';
