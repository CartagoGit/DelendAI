/**
 * projection-parity.ts — f00534 S3.
 *
 * The evidence q00022 S4 needs before it inverts the direction of the
 * truth.
 *
 * Today the proposals runtime reads `.cache/delendai/proposals/index.json`
 * and the SQL readers return `null` — so nobody has ever compared the two
 * representations on real data. Flipping the read path without that
 * comparison is a blind jump: if the SQL projection is missing proposals,
 * or disagrees about their status, the flip silently changes what the
 * whole workflow believes.
 *
 * This module answers one question, and refuses to answer it by
 * assertion: for the SAME repository, do the two representations carry
 * the same set of proposal ids, and do they agree on each one's status?
 *
 * `compareProjectionParity` is pure — two arrays in, a classified
 * difference report out, no clock, no filesystem, no database. The two
 * readers below it are the impure edge, kept separate and thin so the
 * comparison itself stays testable without either representation
 * existing.
 *
 * The three classifications are deliberately NOT collapsed into one
 * "differs" count, because they mean different things:
 *
 *   - `onlyInSql`     — the projection knows a proposal the runtime does
 *                       not. Flipping the read path would ADD proposals.
 *   - `onlyInJson`    — the runtime knows a proposal the projection does
 *                       not. Flipping the read path would LOSE them. This
 *                       is the dangerous column.
 *   - `statusDivergent` — both know the proposal and disagree about where
 *                       it is in its lifecycle. Flipping the read path
 *                       would change decisions, not inventory.
 */

/** One proposal as either representation sees it. */
export interface IProjectionEntry {
	readonly id: string;
	readonly status: string;
}

export interface IStatusDivergence {
	readonly id: string;
	readonly sql: string;
	readonly json: string;
}

export interface IProjectionParityReport {
	readonly sqlCount: number;
	readonly jsonCount: number;
	/** Ids present in both representations. */
	readonly sharedCount: number;
	/** Ids present in both AND agreeing on status. */
	readonly agreeingCount: number;
	readonly onlyInSql: readonly string[];
	readonly onlyInJson: readonly string[];
	readonly statusDivergent: readonly IStatusDivergence[];
	/** True only when all three difference sets are empty. */
	readonly inParity: boolean;
}

export interface ICompareProjectionParityInput {
	readonly sql: readonly IProjectionEntry[];
	readonly json: readonly IProjectionEntry[];
}

const byId = (
	entries: readonly IProjectionEntry[],
): ReadonlyMap<string, string> => {
	const map = new Map<string, string>();
	for (const entry of entries) map.set(entry.id, entry.status);
	return map;
};

/**
 * Pure set/status comparison of the two representations.
 *
 * Duplicate ids within one side collapse to the last occurrence, which
 * is what both representations mean by "the current row for this id".
 */
export const compareProjectionParity = (
	input: ICompareProjectionParityInput,
): IProjectionParityReport => {
	const sql = byId(input.sql);
	const json = byId(input.json);

	const onlyInSql: string[] = [];
	const onlyInJson: string[] = [];
	const statusDivergent: IStatusDivergence[] = [];
	let sharedCount = 0;
	let agreeingCount = 0;

	for (const [id, sqlStatus] of sql) {
		const jsonStatus = json.get(id);
		if (jsonStatus === undefined) {
			onlyInSql.push(id);
			continue;
		}
		sharedCount += 1;
		if (jsonStatus === sqlStatus) {
			agreeingCount += 1;
		} else {
			statusDivergent.push({ id, sql: sqlStatus, json: jsonStatus });
		}
	}
	for (const id of json.keys()) {
		if (!sql.has(id)) onlyInJson.push(id);
	}

	const sort = (values: string[]): readonly string[] =>
		[...values].sort((a, b) => a.localeCompare(b));

	return {
		sqlCount: sql.size,
		jsonCount: json.size,
		sharedCount,
		agreeingCount,
		onlyInSql: sort(onlyInSql),
		onlyInJson: sort(onlyInJson),
		statusDivergent: [...statusDivergent].sort((a, b) =>
			a.id.localeCompare(b.id),
		),
		inParity:
			onlyInSql.length === 0 &&
			onlyInJson.length === 0 &&
			statusDivergent.length === 0,
	};
};

/**
 * The shape `.cache/delendai/proposals/index.json` actually has — the
 * index the runtime READS, not the docs `INDEX.json` files (r00049).
 */
export interface IRuntimeIndexShape {
	readonly proposals?: readonly {
		readonly id?: unknown;
		readonly status?: unknown;
	}[];
}

/**
 * Project the runtime index into comparable entries. Entries without a
 * string `id` are skipped: an index row with no identity cannot be
 * compared against anything, and inventing a placeholder id would
 * manufacture a false divergence.
 */
export const runtimeIndexEntries = (
	index: IRuntimeIndexShape,
): readonly IProjectionEntry[] => {
	const entries: IProjectionEntry[] = [];
	for (const row of index.proposals ?? []) {
		if (typeof row.id !== 'string' || row.id === '') continue;
		entries.push({
			id: row.id,
			status: typeof row.status === 'string' ? row.status : '',
		});
	}
	return entries;
};
