/**
 * Thin barrel re-exporting the public surface of the audit-brief.
 *
 * The implementation used to live in this file (≈550 LOC); it was
 * split in x00091 / s1 into three focused modules under `./brief/`:
 *
 *   - `severity-table.service.ts` — 7-band rubric (`SEVERITY_TABLE_ROWS`,
 *     `renderSeverityTable`).
 *   - `brief-modes.service.ts`    — `AuditMode` union, `inferMode`,
 *     `renderMonorepoBadge`, `renderAvailableModes`.
 *   - `brief-builder.service.ts`  — `buildBrief` + the private
 *     reading-phase assemblers, the `IBriefOptions` contract, the
 *     `AuditScope` alias.
 *
 * This barrel preserves the previous public surface: every name
 * callers used to import from here is still re-exported from here,
 * including the constants (`ALL_SCOPES`, `SCOPE_LABEL`,
 * `SCORE_DIMENSIONS`, `UNIVERSAL_SCOPES`) and the types
 * (`AuditScope`, `AuditMode`, `ILayerConfig`, `UniversalAuditScope`).
 *
 * No new public method is exposed by the split; `inferMode` is the
 * sole addition made available to `audit-plan.tool.ts` and lives
 * directly in `brief-modes.service.ts` (the import path there is
 * unchanged because the tool already imports from a sibling).
 */
export { buildBrief } from './brief/brief-builder.service';
export type {
	AuditMode,
	AuditScope,
	IBriefOptions,
} from './brief/brief-builder.service';
export {
	ALL_SCOPES,
	SCOPE_LABEL,
	SCORE_DIMENSIONS,
	UNIVERSAL_SCOPES,
} from './audit-brief.constants';
export type {
	ILayerConfig,
	UniversalAuditScope,
} from './audit-brief.constants';
