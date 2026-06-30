/**
 * Public re-exports for `@mcp-vertex/audit`.
 *
 * Downstream plugins can import the brief + consolidator without going
 * through the plugin registry (handy for ad-hoc scripts or web tooling).
 */
export {
	buildBrief,
	ALL_SCOPES,
	SCOPE_LABEL,
} from '../lib/services/audit-brief.service';
export type {
	AuditMode,
	AuditScope,
} from '../lib/services/audit-brief.service';
export {
	parseAuditBody,
	parseAuditFiles,
} from '../lib/services/parse-audit.service';
export {
	consolidateAudits,
	renderConsolidationMarkdown,
} from '../lib/services/audit-consolidate.service';
export type { IConsolidateOptions } from '../lib/services/audit-consolidate.service';
export {
	auditDateStamp,
	auditFilename,
	callLlm,
	callLlmFanOut,
	isoDate,
	resolveTarget,
} from '../lib/services/llm-client.service';
export type {
	ILlmCallError,
	ILlmCallOutcome,
	ILlmCallResult,
	ILlmClientOptions,
	IHttpTransport,
	IModelTarget,
	IResolvedTarget,
	LlmProvider,
} from '../lib/services/llm-client.service';
export {
	proposalFilenameFor,
	scaffoldProposals,
} from '../lib/services/proposal-scaffolder.service';
export type {
	IScaffoldedProposal,
	IScaffoldOptions,
} from '../lib/services/proposal-scaffolder.service';
export {
	resolveAutoScaffold,
} from '../lib/services/auto-scaffold-proposals.service';
export type {
	AutoScaffoldOutcome,
	IAutoScaffoldOptions,
} from '../lib/services/auto-scaffold-proposals.service';

export {
	buildRunRegistration,
	probeAudits,
	probeProposals,
} from '../lib/tools/audit-run.tool';
export type { IRunToolOptions } from '../lib/tools/audit-run.tool';
export type {
	AuditSeverity,
	IAuditDocument,
	IAuditFinding,
	IAuditScore,
	IAuditSource,
	IConsolidation,
} from '../lib/contracts/interfaces/audit.interface';
export {
	SEVERITY_ORDER,
	SEVERITY_USER_LABEL,
} from '../lib/contracts/interfaces/audit.interface';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
