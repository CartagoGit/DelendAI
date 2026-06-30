/**
 * store.ts — public barrel for the memory store.
 *
 * The original implementation lived in this 477-line file. The
 * SOLID refactor split the responsibility into four single-purpose
 * modules:
 *
 *   - `store-types.ts`    — the `INote` / `ISaveResult` shapes and
 *                            `DEFAULT_MAX_NOTES` constant.
 *   - `store-io.ts`       — pure file I/O: `readStore`, `writeStore`,
 *                            and the per-path `withStoreLock` helper.
 *   - `store-records.ts`  — CRUD on individual notes: `saveNote`,
 *                            `removeNote`, `getMaxNotes`, `deriveNoteId`.
 *   - `store-recall.ts`   — BM25-lite ranking: `recall`.
 *   - `store-portable.ts` — export/import: `exportNotes`, `importNotes`.
 *
 * This barrel re-exports every public symbol under its original name
 * so the six `*.tool.ts` files (which import from `./store` and
 * `../services/store`) keep working without a single import edit.
 *
 * SOLID summary applied here:
 *   - SRP — each concern lives in its own module.
 *   - OCP — new export formats, new conflict policies, new ranking
 *          models are added by appending a new module + a single
 *          re-export line here, no edit to existing code.
 *   - LSP — every re-export keeps the original type; the barrel is
 *          behaviour-preserving.
 *   - ISP — consumers can import from a sub-module directly if they
 *          want only one concern (e.g. `store-types`).
 *   - DIP — the import paths don't depend on Bun, on `node:fs`, or
 *          on a global config; each module receives its deps as
 *          function parameters.
 */

export type { INote, ISaveResult } from './store-types';
export { DEFAULT_MAX_NOTES } from './store-types';

export { readStore, writeStore } from './store-io';

export {
	deriveNoteId,
	expireExpiredNotes,
	getMaxNotes,
	removeNote,
	saveNote,
} from './store-records';

export { recall } from './store-recall';

export {
	exportNotes,
	importNotes,
	type IMemoryExportFormat,
	type IMemoryImportConflict,
	type IMemoryImportFormat,
	type IMemoryImportMode,
	type IMemoryImportResult,
} from './store-portable';
