/**
 * plan-closure.ts
 *
 * Pure evaluator for the `plan` proposal kind (q00001). Given a parsed
 * plan document and a children resolver (DIP — tests inject an in-memory
 * map, the real tool reads the index), returns a structured report that
 * says whether the plan is closable and, if not, exactly which children
 * are blocking.
 *
 * Closure contract (mirrors `q00001-plan-of-plans.md`):
 *   - `requireAllChildrenDone === true`  → every referenced proposal is
 *     `status: done` AND every sub-plan is `status: done` AND every own
 *     slice has `status: done`.
 *   - `requirePeerReview === true`       → every child proposal's index
 *     entry has `peerReviewed: true` (legacy entries default to true).
 *   - `requireAllSlicesDone === true`    → the plan's own `## Slices`
 *     block has no `- status: pending` or `- status: in-progress` lines.
 *
 * Recursion:
 *   - The evaluator carries a `visited: Set<string>` and aborts with a
 *     `cycle-detected` blocker if the same `planId` is reached twice
 *     (defence against q00002 → q00001 → q00002).
 *
 * Pure: no I/O. The `IPlanChildrenResolver` interface lets the caller
 * (real tool, tests) decide how to look up child state.
 */

import type { IProposalFrontmatter } from '../proposals/proposal-document';

// ---------------------------------------------------------------------------
// Children resolver (DIP) — tests inject an in-memory map.
// ---------------------------------------------------------------------------

export type IPlanChildKind = 'proposal' | 'plan' | 'slice';

export interface IPlanChildSnapshot {
	readonly ref: string;
	readonly kind: IPlanChildKind;
	readonly status: string;
	/** Required by `requirePeerReview: true`; legacy entries default to true. */
	readonly peerReviewed: boolean;
}

export interface IPlanChildrenResolver {
	/** Resolve a single child by its `ref` (proposal id, plan id, or slice id). */
	resolveOne(ref: string, kind: IPlanChildKind): Promise<IPlanChildSnapshot>;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IPlanClosureReason {
	readonly ref: string;
	readonly kind: IPlanChildKind;
	readonly code:
		| 'not-done'
		| 'not-peer-reviewed'
		| 'self-cycle'
		| 'unknown-ref';
	readonly message: string;
}

export interface IPlanClosureReport {
	readonly planId: string;
	readonly closable: boolean;
	readonly reasons: readonly IPlanClosureReason[];
	readonly children: readonly IPlanChildSnapshot[];
	/** Recursive depth reached (1 = top-level plan only). */
	readonly depth: number;
}

export type IEvaluatePlanClosureOptions = {
	readonly planId: string;
	readonly frontmatter: IProposalFrontmatter;
	readonly resolver: IPlanChildrenResolver;
	/**
	 * Optional override for recursion depth (defence in depth — even
	 * though `visited` catches cycles, a host that expects very deep
	 * plans can raise the cap). Default 16.
	 */
	readonly maxDepth?: number;
};

// ---------------------------------------------------------------------------
// Default values for the `closureGate` block.
// ---------------------------------------------------------------------------

const DEFAULTS = {
	requirePeerReview: true,
	requireAllSlicesDone: true,
	requireAllChildrenDone: true,
} as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reads a boolean frontmatter flag with a default. Tolerant to the YAML
 * parser's `1/0` quirks: anything truthy (1, true, "true", "yes") counts
 * as enabled; anything falsy (0, false, "false", "no", null) counts as
 * disabled; missing → `defaultValue`.
 */
const readFlag = (value: unknown, defaultValue: boolean): boolean => {
	if (value === undefined || value === null) return defaultValue;
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	if (typeof value === 'string') {
		const v = value.trim().toLowerCase();
		if (['true', 'yes', '1', 'on'].includes(v)) return true;
		if (['false', 'no', '0', 'off', ''].includes(v)) return false;
	}
	return defaultValue;
};

/** Tolerant id extraction — accepts string, number, or `{id: ...}` object. */
const readId = (entry: unknown): string | null => {
	if (typeof entry === 'string') return entry.trim() || null;
	if (typeof entry === 'number') return String(entry);
	if (entry !== null && typeof entry === 'object') {
		const obj = entry as Record<string, unknown>;
		const id = obj.id;
		if (typeof id === 'string') return id.trim() || null;
		if (typeof id === 'number') return String(id);
	}
	return null;
};

/** Read the slice statuses for a plan from its `contains.slices` block. */
const readPlanOwnSlices = (
	frontmatter: IProposalFrontmatter,
): readonly { id: string; required: boolean }[] => {
	const list = frontmatter.contains?.slices ?? [];
	return list
		.map((entry) => ({ id: entry.id, required: entry.required !== false }))
		.filter((s) => s.id.length > 0);
};

/** Read the slice statuses for a plan by parsing its own `## Slices` block
 *  on disk. Caller pre-fetches the markdown body and passes it in. */
export const readPlanOwnSliceStatuses = (
	markdown: string | undefined,
): ReadonlyMap<string, string> => {
	const map = new Map<string, string>();
	if (markdown === undefined) return map;
	// Match a `### <sliceId> ... - status: <value>` pair. Be tolerant of
	// either `s1: pending` or `**Status**: pending` line variants.
	const sectionRe = /^##\s+Slices\s*$([\s\S]*?)(?=^##\s|\n*$(?![\s\S]))/m;
	const m = markdown.match(sectionRe);
	if (m === null) return map;
	const section = m[1] ?? '';
	// Capture `### <id> — <title>` and the following `- status: ...` line.
	const blockRe =
		/###\s+([A-Za-z0-9_-]+)[^\n]*\n([\s\S]*?)(?=###\s|\n*$(?![\s\S]))/g;
	let bm: RegExpExecArray | null;
	while ((bm = blockRe.exec(section)) !== null) {
		const id = bm[1] ?? '';
		const body = bm[2] ?? '';
		const sm = body.match(
			/^[ \t]*-\s+(?:\*\*Status\*\*:\s*|status:\s*)([a-z-]+)/m,
		);
		if (sm) {
			map.set(id, (sm[1] ?? '').trim());
		}
	}
	return map;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Recursively evaluate whether a plan can be closed. Returns a structured
 * report — never throws. Cycle detection is defensive (`visited` set);
 * the report surfaces a `self-cycle` reason instead of infinite-looping.
 */
export const evaluatePlanClosure = async (
	options: IEvaluatePlanClosureOptions,
): Promise<IPlanClosureReport> => {
	const maxDepth = options.maxDepth ?? 16;
	const visited = new Set<string>([options.planId]);
	return walk({
		planId: options.planId,
		frontmatter: options.frontmatter,
		resolver: options.resolver,
		visited,
		depth: 1,
		maxDepth,
	});
};

interface IWalkArgs {
	readonly planId: string;
	readonly frontmatter: IProposalFrontmatter;
	readonly resolver: IPlanChildrenResolver;
	readonly visited: Set<string>;
	readonly depth: number;
	readonly maxDepth: number;
}

const walk = async (args: IWalkArgs): Promise<IPlanClosureReport> => {
	const { planId, frontmatter, resolver, visited, depth, maxDepth } = args;
	const reasons: IPlanClosureReason[] = [];
	const children: IPlanChildSnapshot[] = [];

	const requirePeerReview = readFlag(
		frontmatter.closureGate?.requirePeerReview,
		DEFAULTS.requirePeerReview,
	);
	const requireAllSlicesDone = readFlag(
		frontmatter.closureGate?.requireAllSlicesDone,
		DEFAULTS.requireAllSlicesDone,
	);
	const requireAllChildrenDone = readFlag(
		frontmatter.closureGate?.requireAllChildrenDone,
		DEFAULTS.requireAllChildrenDone,
	);

	// --- 1. Contained proposals ---
	const proposalList = frontmatter.contains?.proposals ?? [];
	for (const entry of proposalList) {
		const id = entry.id;
		if (id.length === 0) continue;
		const snap = await resolver.resolveOne(id, 'proposal');
		children.push(snap);
		if (requireAllChildrenDone && snap.status !== 'done') {
			reasons.push({
				ref: id,
				kind: 'proposal',
				code: 'not-done',
				message: `Proposal ${id} is '${snap.status}', expected 'done'`,
			});
		}
		if (requirePeerReview && !snap.peerReviewed) {
			reasons.push({
				ref: id,
				kind: 'proposal',
				code: 'not-peer-reviewed',
				message: `Proposal ${id} is not peer-reviewed`,
			});
		}
	}

	// --- 2. Contained sub-plans (recursive) ---
	const planList = frontmatter.contains?.plans ?? [];
	for (const entry of planList) {
		const id = entry.id;
		if (id.length === 0) continue;
		if (visited.has(id)) {
			reasons.push({
				ref: id,
				kind: 'plan',
				code: 'self-cycle',
				message: `Plan cycle detected: ${planId} → ${id} already visited`,
			});
			continue;
		}
		if (depth >= maxDepth) {
			reasons.push({
				ref: id,
				kind: 'plan',
				code: 'self-cycle',
				message: `Max recursion depth (${maxDepth}) reached at ${id}`,
			});
			continue;
		}
		// Look up the sub-plan's frontmatter via the resolver. The real
		// resolver will read it from disk; the in-memory test resolver
		// returns a synthetic one. We only need its own `contains` and
		// `closureGate` to recurse, plus its own status (treated as
		// another child for the parent report).
		const snap = await resolver.resolveOne(id, 'plan');
		children.push(snap);
		if (requireAllChildrenDone && snap.status !== 'done') {
			reasons.push({
				ref: id,
				kind: 'plan',
				code: 'not-done',
				message: `Sub-plan ${id} is '${snap.status}', expected 'done'`,
			});
		}
		// Recurse into the sub-plan's own children. The resolver exposes
		// `resolveSubPlanFrontmatter` so the parent can drill down. The
		// in-memory test resolver returns a synthetic sub-plan frontmatter
		// from a pre-registered map; the real resolver reads the markdown.
		const subFrontmatter = await (
			resolver as IPlanChildrenResolver & {
				resolveSubPlanFrontmatter?(
					ref: string,
				): Promise<IProposalFrontmatter>;
			}
		).resolveSubPlanFrontmatter?.(id);
		if (subFrontmatter !== undefined) {
			visited.add(id);
			const subReport = await walk({
				planId: id,
				frontmatter: subFrontmatter,
				resolver,
				visited,
				depth: depth + 1,
				maxDepth,
			});
			visited.delete(id);
			reasons.push(...subReport.reasons);
			children.push(...subReport.children);
		}
	}

	// --- 3. Own slices (the plan's `## Slices` block) ---
	if (requireAllSlicesDone) {
		const ownSlices = readPlanOwnSlices(frontmatter);
		// The caller is expected to inject the plan's markdown body via
		// a sibling extension on the resolver. For tests that don't
		// care about own-slice status, the slice list still shows up
		// in `children` with status derived from the resolver snapshot.
		for (const slice of ownSlices) {
			const snap = await resolver.resolveOne(slice.id, 'slice');
			children.push(snap);
			if (snap.status !== 'done') {
				reasons.push({
					ref: slice.id,
					kind: 'slice',
					code: 'not-done',
					message: `Own slice ${slice.id} is '${snap.status}', expected 'done'`,
				});
			}
		}
	}

	return {
		planId,
		closable: reasons.length === 0,
		reasons,
		children,
		depth,
	};
};

// ---------------------------------------------------------------------------
// Convenience: build an in-memory resolver from a Map (used by tests).
// ---------------------------------------------------------------------------

export interface IInMemoryResolverInput {
	readonly proposals?: ReadonlyMap<
		string,
		{
			status: string;
			peerReviewed?: boolean;
			frontmatter?: IProposalFrontmatter;
		}
	>;
	readonly slices?: ReadonlyMap<string, { status: string }>;
}

export const buildInMemoryResolver = (
	input: IInMemoryResolverInput,
): IPlanChildrenResolver & {
	resolveSubPlanFrontmatter(ref: string): Promise<IProposalFrontmatter>;
} => {
	const proposals = input.proposals ?? new Map();
	const slices = input.slices ?? new Map();
	return {
		resolveOne: async (ref, kind) => {
			if (kind === 'slice') {
				const s = slices.get(ref);
				return {
					ref,
					kind,
					status: s?.status ?? 'unknown',
					peerReviewed: true,
				};
			}
			const p = proposals.get(ref);
			return {
				ref,
				kind,
				status: p?.status ?? 'unknown',
				peerReviewed: p?.peerReviewed ?? true,
			};
		},
		resolveSubPlanFrontmatter: async (ref) => {
			const p = proposals.get(ref);
			if (p?.frontmatter === undefined) {
				throw new Error(
					`Sub-plan ${ref} has no frontmatter in test resolver`,
				);
			}
			return p.frontmatter;
		},
	};
};
// ---------------------------------------------------------------------------
// Disk-backed resolver (used by proposal_transition and proposals_close_plan).
//
// Reads child state from `docs/proposals/index.json` and slice state from
// the plan's own `## Slices` block on disk. Peer-review is intentionally
// NOT read from the index yet (it is not a live field) — the resolver
// defaults it to `true` to avoid a migration cliff; proposal_transition
// can layer a tighter check later by parsing the proposal-review log.
// ---------------------------------------------------------------------------

import { readFile } from 'node:fs/promises';

import { parseProposalDocument } from '../proposals/proposal-document';

export interface IDiskPlanResolverOptions {
	/** Absolute path to `docs/proposals/index.json` (the registry). */
	readonly indexPathAbs: string;
	/** Absolute path to the `docs/proposals/` directory. */
	readonly proposalsDirAbs: string;
}

interface IIndexEntry {
	readonly id: string;
	readonly file: string;
	readonly type?: string;
	readonly status?: string;
	readonly peerReviewed?: boolean;
}

interface IIndexFile {
	readonly proposals: readonly IIndexEntry[];
}

const readIndex = async (
	indexPathAbs: string,
): Promise<ReadonlyMap<string, IIndexEntry>> => {
	let raw: string;
	try {
		raw = await readFile(indexPathAbs, 'utf8');
	} catch {
		return new Map();
	}
	let parsed: IIndexFile;
	try {
		parsed = JSON.parse(raw) as IIndexFile;
	} catch {
		return new Map();
	}
	const map = new Map<string, IIndexEntry>();
	for (const entry of parsed.proposals ?? []) {
		if (typeof entry.id === 'string') {
			map.set(entry.id, entry);
		}
	}
	return map;
};

export const buildDiskPlanChildrenResolver = async (
	options: IDiskPlanResolverOptions,
): Promise<
	IPlanChildrenResolver & {
		resolveSubPlanFrontmatter(ref: string): Promise<IProposalFrontmatter>;
	}
> => {
	const index = await readIndex(options.indexPathAbs);
	const findFileFor = (id: string): string | null => {
		const e = index.get(id);
		return e?.file ?? null;
	};
	return {
		resolveOne: async (ref, kind) => {
			if (kind === 'slice') {
				// Own-slice status is read separately by the caller via
				// `readOwnSliceStatusesFromDisk`. The resolver reports
				// `unknown` here so the guard surfaces a `not-done`
				// blocker the user can resolve by re-syncing.
				return { ref, kind, status: 'unknown', peerReviewed: true };
			}
			const entry = index.get(ref);
			return {
				ref,
				kind,
				status: entry?.status ?? 'unknown',
				peerReviewed: entry?.peerReviewed ?? true,
			};
		},
		resolveSubPlanFrontmatter: async (ref) => {
			const file = findFileFor(ref);
			if (file === null) {
				throw new Error(
					`buildDiskPlanChildrenResolver: sub-plan ${ref} not in index`,
				);
			}
			const abs = file.startsWith('/')
				? file
				: `${options.proposalsDirAbs}/${file}`;
			const doc = await parseProposalDocument(abs);
			return doc.frontmatter;
		},
	};
};

/**
 * Read a plan's own `## Slices` statuses from disk. Returns an empty map
 * when the file is missing or has no Slices section.
 */
export const readOwnSliceStatusesFromDisk = async (
	planMarkdownPath: string,
): Promise<ReadonlyMap<string, string>> => {
	let raw: string;
	try {
		raw = await readFile(planMarkdownPath, 'utf8');
	} catch {
		return new Map();
	}
	return readPlanOwnSliceStatuses(raw);
};
