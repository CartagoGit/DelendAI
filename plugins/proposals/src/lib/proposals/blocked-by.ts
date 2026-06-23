/**
 * blocked-by.ts
 *
 * q00001: surface a `plan` proposal's open children so the
 * orchestrator knows why the plan is not closable yet. This module
 * owns ONLY the "given an index entry for a `type: plan` proposal,
 * what are the ids of contained children that are not yet `done`?"
 * question.
 *
 * SRP: the function reads one proposal's markdown (to inspect the
 * `contains:` block) and the proposal index (to look up each
 * child's status). It does NOT do closure evaluation (that's the
 * plan-closure engine), nor does it know how the caller will use
 * the result (board rendering, dashboard, plan-closure preflight).
 *
 * DIP: the readers are injected via `Partial<IBlockedByReaders>`,
 * so callers (tests, dry-run modes, batch tools) can supply
 * pre-fetched data without touching the filesystem. The default
 * implementation delegates to `proposals/index-reader.ts` for
 * production use.
 *
 * Pre-refactor: `blockedByFor` was a private helper inside
 * `continue-proposal.tool.ts`. Moving it here:
 *   - makes it testable in isolation (no MCP-server boilerplate),
 *   - lets `proposal_board` and any future dashboard tool reuse the
 *     same projection without duplicating the frontmatter parsing,
 *   - keeps `continue-proposal.tool.ts` focused on its actual job
 *     (orchestrating modes auto / plan / claim).
 *
 * Pure async: no shared state, no globals. Reads only the files it
 * is told to read. Returns an empty list for non-plan proposals (no
 * behaviour change for the 12 existing kinds) and for any plan whose
 * children all happen to be `done` already.
 */

import { dirname, join } from 'node:path';

import { extractYamlBlock, parseFrontmatterBlock } from './frontmatter-parser';
import type { IYamlValue } from './frontmatter-parser';
import { readProposalIndex, readTextOrNull } from './index-reader';
import type { IProposalIndexEntry } from './index-reader';

// ---------------------------------------------------------------------------
// DIP — readers are injected.
// ---------------------------------------------------------------------------

/**
 * The minimal I/O surface `blockedByFor` needs. Production code uses
 * `defaultBlockedByReaders` (filesystem); tests pass their own
 * pre-canned values via `Partial<IBlockedByReaders>` to exercise the
 * projection logic without touching disk.
 *
 * Keep this interface tight — every method is `Promise<T | null>`
 * because the production readers are missing-tolerant (a stale
 * index, a deleted proposal file, etc. must not crash the projection).
 */
export interface IBlockedByReaders {
	readTextOrNull(path: string): Promise<string | null>;
	readProposalIndex(
		indexPathAbs: string,
	): Promise<readonly IProposalIndexEntry[]>;
}

/**
 * The default readers — call the shared `proposals/index-reader.ts`
 * helpers. Production callers do not need to construct this; the
 * `partial` argument in `blockedByFor` defaults to it.
 */
export const defaultBlockedByReaders: IBlockedByReaders = {
	readTextOrNull,
	readProposalIndex,
};

/**
 * For a `type: plan` proposal referenced by the given index entry,
 * return the ids of contained proposals + sub-plans whose status is
 * not `done`. Always returns:
 *   - `[]` when the proposal is not a plan,
 *   - `[]` when the proposal file is missing or unparseable,
 *   - `[]` when the plan has no `contains:` block,
 *   - the union of un-done children from `contains.proposals` and
 *     `contains.plans`.
 *
 * Own slices are intentionally NOT included here — the closure
 * evaluator (`plan-closure.engine.ts`) handles own-slice status
 * separately because it needs richer context (the slice's
 * `- status: done` line in the plan's `## Slices` section, not just
 * the index entry).
 *
 * @param readers Optional overrides for the readers. When omitted,
 * the production filesystem-backed readers from
 * `defaultBlockedByReaders` are used.
 */
export const blockedByFor = async (
	entry: IProposalIndexEntry,
	indexPathAbs: string,
	readers: Partial<IBlockedByReaders> = {},
): Promise<readonly string[]> => {
	const resolvedReaders: IBlockedByReaders = {
		...defaultBlockedByReaders,
		...readers,
	};
	const docPath = join(dirname(indexPathAbs), entry.file);
	const markdown = await resolvedReaders.readTextOrNull(docPath);
	if (markdown === null) return [];
	const block = extractYamlBlock(markdown);
	if (block === null) return [];
	const fm = parseFrontmatterBlock(block);
	if (fm.type !== 'plan') return [];

	const entries = await resolvedReaders.readProposalIndex(indexPathAbs);
	const statusById = new Map(entries.map((e) => [e.id, e.status]));

	const contains =
		fm.contains !== null &&
		typeof fm.contains === 'object' &&
		!Array.isArray(fm.contains)
			? (fm.contains as Record<string, IYamlValue>)
			: null;
	const proposals = Array.isArray(contains?.proposals)
		? (contains.proposals as readonly unknown[])
		: [];
	const plans = Array.isArray(contains?.plans)
		? (contains.plans as readonly unknown[])
		: [];

	return [
		...collectOpenChildren(proposals, statusById),
		...collectOpenChildren(plans, statusById),
	];
};

// ---------------------------------------------------------------------------
// Internal helpers — kept private so the caller can't accidentally
// re-use them with a non-Map (the Map ensures O(1) status lookup).
// ---------------------------------------------------------------------------

const collectOpenChildren = (
	list: readonly unknown[],
	statusById: ReadonlyMap<string, string>,
): string[] => {
	const out: string[] = [];
	for (const entry of list) {
		const id = readChildId(entry);
		if (id === null) continue;
		const status = statusById.get(id);
		if (status === undefined || status === 'done') continue;
		out.push(id);
	}
	return out;
};

/**
 * Tolerant id extraction from a `contains.*[].id` entry. Accepts the
 * three shapes the YAML parser can produce:
 *   - a bare string (`"f00049"`),
 *   - a number (`42`),
 *   - an object with an `id` field (`{ id: "f00049" }`).
 *
 * Returns `null` for anything else. The `null` is intentional — the
 * caller treats it as "skip this entry", so a malformed line never
 * crashes the projection.
 */
const readChildId = (entry: unknown): string | null => {
	if (typeof entry === 'string') return entry.trim() || null;
	if (typeof entry === 'number') return String(entry);
	if (entry !== null && typeof entry === 'object') {
		const id = (entry as Record<string, unknown>).id;
		if (typeof id === 'string') return id.trim() || null;
		if (typeof id === 'number') return String(id);
	}
	return null;
};
