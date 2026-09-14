/**
 * revision-cas.ts — compare-and-swap over the `revision` column, written
 * once for the three tables that carry one.
 *
 * WHY one module and not a copy per repository: proposals, plans and
 * slices all needed the same primitive, and three implementations of
 * "decide who wins a race" is three chances to decide it differently.
 * The tables differ only in their name and their writable columns, so
 * those are parameters.
 *
 * WHY the precondition lives in the `WHERE` clause of a single
 * statement: it is the only formulation that is correct under
 * concurrency. Reading the revision, comparing it in TypeScript and then
 * writing has a window between the read and the write in which another
 * connection can commit — and both writers then believe they were the
 * one holding revision N. SQLite decides a single `UPDATE … WHERE uid =
 * ? AND revision = ?` atomically, so exactly one caller can win.
 *
 * WHY `RETURNING` and not `changes`: `changes` is not a reliable verdict
 * on these tables. Measured — a successful single-row update on
 * `proposals` reports `changes: 10`, because the FTS5 mirror triggers
 * added in 0010 fire on the same statement and their work is counted
 * too. A CAS written as `changes === 1` would therefore report every
 * winner as a loser on exactly the table it matters most for, and would
 * have looked correct on any table without triggers. `RETURNING` answers
 * about the row itself: a row comes back when this statement updated it,
 * and nothing comes back when the precondition did not hold.
 *
 * WHY `changes === 0` is not immediately a conflict: it also happens
 * when the row does not exist at all. Reporting a missing proposal as a
 * lost race would send a caller to retry something that can never
 * succeed, so the two are distinguished by a follow-up read — which is
 * safe precisely because nothing was written.
 *
 * This is the application-level half. Migration 0018 adds the other:
 * triggers that reject any revision step other than exactly one, from
 * any writer, including SQL typed at a console. CAS decides who wins a
 * race; the triggers decide whether the sequence is coherent at all.
 */

import type { Database } from 'bun:sqlite';

import type {
	IRevisionCasInput,
	IRevisionTable,
	IRevisionCasOutcome,
} from './revision-cas.interface';
import { WRITABLE_COLUMNS } from './revision-cas.interface';

export type {
	IRevisionCasInput,
	IRevisionTable,
	IRevisionCasOutcome,
} from './revision-cas.interface';
export { REVISION_TABLES } from './revision-cas.interface';

const readRevision = (
	db: Database,
	table: IRevisionTable,
	uid: string,
): number | null => {
	const row = db
		.query<{ revision: number }, [string]>(
			`SELECT revision FROM ${table} WHERE uid = ?`,
		)
		.get(uid);
	return row?.revision ?? null;
};

/**
 * Apply `patch` to one row, but only if its revision is still
 * `expectedRevision`. Never throws for a lost race or a missing row —
 * both are answers.
 */
export const casUpdate = (
	db: Database,
	input: IRevisionCasInput,
): IRevisionCasOutcome => {
	const writable = WRITABLE_COLUMNS[input.table];
	const columns = Object.keys(input.patch);
	const unknown = columns.filter((column) => !writable.includes(column));
	if (unknown.length > 0) {
		throw new Error(
			`revision-cas: ${input.table} has no writable column(s) ${unknown.join(', ')}; a patch may only name ${writable.join(', ')}.`,
		);
	}
	if (columns.length === 0) {
		throw new Error(
			`revision-cas: an empty patch would still consume a revision on ${input.table}, which would make the sequence lie about what changed.`,
		);
	}

	const assignments = columns.map((column) => `${column} = ?`).join(', ');
	const updated = db
		.prepare<{ revision: number }, (string | number | null)[]>(
			`UPDATE ${input.table}
			 SET ${assignments}, revision = revision + 1
			 WHERE uid = ? AND revision = ?
			 RETURNING revision`,
		)
		.get(
			...columns.map((column) => input.patch[column] ?? null),
			input.uid,
			input.expectedRevision,
		);

	if (updated !== null) {
		return { kind: 'updated', revision: updated.revision };
	}

	// Nothing was written, so reading now cannot race with our own work.
	const current = readRevision(db, input.table, input.uid);
	return current === null
		? { kind: 'missing' }
		: { kind: 'conflict', currentRevision: current };
};
