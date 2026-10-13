/**
 * evidence-store.ts — public entry point of the evidence store.
 *
 * The implementation moved to `evidence-store.facade.ts` in f00533
 * (SQLite primary, one-file-per-event as the fallback). This module
 * stays the import path so `packages/core/src/public/index.ts` and
 * `packages/core/src/lib/cli/assemble.ts` — and every plugin behind
 * them — are unaffected by the change of backend.
 */

export {
	buildEvidenceEnvelope,
	createEvidenceStore,
	EVIDENCE_DB_BASENAME,
	EVIDENCE_DEFAULT_KEEP_LAST_N,
	EVIDENCE_DEFAULT_RETENTION_DAYS,
	EVIDENCE_TYPES,
} from './evidence-store.facade';
export type {
	IEvidenceStoreOptions,
	IEvidenceStoreWithCleanup,
	TEvidenceBackend,
} from './evidence-store.facade';
