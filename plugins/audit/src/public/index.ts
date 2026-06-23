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
export type { AuditScope } from '../lib/services/audit-brief.service';
export {
	parseAuditBody,
	parseAuditFiles,
} from '../lib/services/parse-audit.service';
export {
	consolidateAudits,
	renderConsolidationMarkdown,
} from '../lib/services/audit-consolidate.service';
export type { IConsolidateOptions } from '../lib/services/audit-consolidate.service';
export type {
	AuditSeverity,
	IAuditDocument,
	IAuditFinding,
	IAuditScore,
	IAuditSource,
	IConsolidation,
} from '../lib/contracts/interfaces/audit.interface';
export { SEVERITY_ORDER } from '../lib/contracts/interfaces/audit.interface';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
