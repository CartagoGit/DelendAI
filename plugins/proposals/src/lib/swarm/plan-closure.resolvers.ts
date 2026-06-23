/**
 * plan-closure.resolvers.ts
 *
 * Concrete `IPlanChildrenResolver` implementations. Two builders:
 *
 *   - `buildInMemoryResolver`     — used by tests; takes Maps.
 *   - `buildDiskPlanChildrenResolver` — used by the real tools;
 *     reads the proposal index + (optionally) parses each sub-plan's
 *     markdown.
 *
 * SRP: this module owns ONLY the "how do I look up a child?" question.
 * It does not know about closure policies, recursive walking, or
 * reporting — those live in `engine.ts`.
 *
 * Own-slice status is exposed by both resolvers through the same
 * `resolveOne(ref, 'slice')` surface — the disk resolver reads the
 * plan's own `## Slices` block on the fly via a side-channel function
 * (`readOwnSliceStatusesFromDisk`) so callers don't have to thread a
 * Map through the engine.
 */

import { readFile } from 'node:fs/promises';

import type { IProposalFrontmatter } from '../proposals/proposal-document';
import { parseProposalDocument } from '../proposals/proposal-document';
import type { IPlanChildrenResolver } from './plan-closure.strategy';

// ---------------------------------------------------------------------------
// In-memory resolver (tests)
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

/**
 * Build a resolver backed by plain Maps. Every snapshot is freshly
 * constructed per call (no aliasing) so tests can mutate the input
 * Maps between assertions without contaminating earlier results.
 */
export const buildInMemoryResolver = (
	input: IInMemoryResolverInput,
): IPlanChildrenResolver => {
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
// Disk-backed resolver (real tools)
// ---------------------------------------------------------------------------

export interface IDiskPlanResolverOptions {
	/** Absolute path to `docs/proposals/index.json` (the registry). */
	readonly indexPathAbs: string;
	/** Absolute path to the `docs/proposals/` directory. */
	readonly proposalsDirAbs: string;
	/**
	 * Optional Map of own-slice statuses, typically produced by
	 * `readOwnSliceStatusesFromDisk(planMarkdownPath)`. When supplied,
	 * the resolver answers `kind === 'slice'` for those refs with
	 * the matching status; otherwise it reports `'unknown'`.
	 *
	 * The two-step construction (parse the plan first, then build the
	 * resolver) keeps the resolver single-responsibility: it does not
	 * read its own markdown. Callers compose.
	 */
	readonly ownSlices?: ReadonlyMap<string, string>;
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

/**
 * Build a resolver backed by the live proposal index + the proposal
 * markdown files for sub-plan recursion. Peer-review defaults to
 * `true` for legacy entries to avoid a migration cliff — a tighter
 * integration with the proposal-review log is left for a follow-up.
 */
export const buildDiskPlanChildrenResolver = async (
	options: IDiskPlanResolverOptions,
): Promise<IPlanChildrenResolver> => {
	const index = await readIndex(options.indexPathAbs);
	const ownSlices = options.ownSlices;
	const findFileFor = (id: string): string | null => {
		const e = index.get(id);
		return e?.file ?? null;
	};
	return {
		resolveOne: async (ref, kind) => {
			if (kind === 'slice') {
				if (ownSlices !== undefined && ownSlices.has(ref)) {
					return {
						ref,
						kind,
						status: ownSlices.get(ref) ?? 'unknown',
						peerReviewed: true,
					};
				}
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

// ---------------------------------------------------------------------------
// Helper: read a plan's own `## Slices` statuses from a markdown blob.
// Kept here (not in the engine) because it parses a markdown
// convention — a parser concern, not a closure-logic concern.
// ---------------------------------------------------------------------------

/**
 * Match a `### <sliceId> ... - status: <value>` pair inside the plan's
 * `## Slices` section. Tolerant of `- **Status**: done` and
 * `- status: done` line variants. Returns an empty Map when the
 * markdown is missing or has no Slices section.
 */
export const readPlanOwnSliceStatuses = (
	markdown: string | undefined,
): ReadonlyMap<string, string> => {
	const map = new Map<string, string>();
	if (markdown === undefined) return map;
	const sectionRe = /^##\s+Slices\s*$([\s\S]*?)(?=^##\s|\n*$(?![\s\S]))/m;
	const m = markdown.match(sectionRe);
	if (m === null) return map;
	const section = m[1] ?? '';
	const blockRe =
		/###\s+([A-Za-z0-9_-]+)[^\n]*\n([\s\S]*?)(?=###\s|\n*$(?![\s\S]))/g;
	// biome-ignore lint/suspicious/noAssignInExpressions: regex iteration idiom
	let bm: RegExpExecArray | null = blockRe.exec(section);
	while (bm !== null) {
		const id = bm[1] ?? '';
		const body = bm[2] ?? '';
		const sm = body.match(
			/^[ \t]*-\s+(?:\*\*Status\*\*:\s*|status:\s*)([a-z-]+)/m,
		);
		if (sm) {
			map.set(id, (sm[1] ?? '').trim());
		}
		bm = blockRe.exec(section);
	}
	return map;
};

/**
 * Read a plan's own `## Slices` statuses from disk. Returns an empty
 * Map when the file is missing or has no Slices section. This is the
 * bridge between the disk resolver (which does NOT read its own
 * markdown) and the engine (which needs slice statuses to evaluate
 * own-slice closure).
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
