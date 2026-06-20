/**
 * Public re-exports for `@mcp-vertex/audit`.
 *
 * Downstream plugins can import the brief + consolidator without going
 * through the plugin registry (handy for ad-hoc scripts or web tooling).
 */
export { buildBrief, ALL_SCOPES, SCOPE_LABEL } from '../lib/brief';
export type { AuditScope } from '../lib/brief';
export { parseAuditBody, parseAuditFiles } from '../lib/parse-audit';
export { consolidateAudits, renderConsolidationMarkdown } from '../lib/consolidate';
export type { IConsolidateOptions } from '../lib/consolidate';
export type {
	AuditSeverity,
	IAuditDocument,
	IAuditFinding,
	IAuditScore,
	IAuditSource,
	IConsolidation,
} from '../lib/types';
export { SEVERITY_ORDER } from '../lib/types';