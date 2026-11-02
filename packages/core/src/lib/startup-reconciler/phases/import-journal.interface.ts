/**
 * Contract shapes for `./import-journal`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `import-journal.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `import-journal.ts`, so no import site changes.
 */

import type { IStartupFinding } from '../contracts';

/** What phase 6 produced. */
export interface IJournalPhaseResult {
	readonly findings: readonly IStartupFinding[];
	readonly counters: {
		readonly journalEventsImported: number;
		readonly journalEventsSkipped: number;
	};
}
