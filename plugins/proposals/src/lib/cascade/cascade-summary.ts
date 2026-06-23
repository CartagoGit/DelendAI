/**
 * cascade-summary.ts
 *
 * Build an `IProposalSummary` from a proposal's index entry + raw
 * markdown. Single source of truth for the "read the frontmatter and
 * project the cascade-relevant fields" step that every consumer of
 * the cascade resolver needs.
 *
 * SRP: this module owns ONLY the projection from raw markdown →
 * `IProposalSummary`. It does NOT rank proposals (that's the cascade
 * resolvers' job), nor does it read the index (that's the index
 * reader's job). It takes an already-fetched entry + markdown and
 * emits the shape the cascade wants.
 *
 * Pre-refactor: `summaryFor` was a private helper inside
 * `continue-proposal.tool.ts`. Moving it here lets future tools
 * (proposal_board filters, audit reporters, ...) reuse the same
 * projection without re-implementing the frontmatter parsing.
 *
 * Tolerant by design: missing/corrupt markdown degrades to
 * "kind inferred from prefix, no override, no boost". The cascade
 * resolver still ranks the proposal — it just ranks it with whatever
 * information was available, which is the correct behaviour for a
 * stale or partially-synced index.
 */

import { join, dirname } from 'node:path';

import { PROPOSAL_KIND_BY_PREFIX } from '../contracts/constants/proposal-glossary.constant';
import { LEGACY_ALIAS_PREFIX } from './cascade-priority';
import type {
	ICascadePriorityResolver,
	IProposalSummary,
	TCascadeBoost,
} from './cascade-priority';
import type { IProposalIndexEntry } from '../proposals/index-reader';
import { readTextOrNull } from '../proposals/index-reader';
import { parseProposalFrontmatter } from '../shared/proposal-frontmatter';

// ---------------------------------------------------------------------------
// Public types.
// ---------------------------------------------------------------------------

/**
 * f00024: project a free index entry's frontmatter
 * (`cascadeOverride`, `cascadeOverrideReason`, `cascadeBoost`) into an
 * `IProposalSummary` the cascade resolver can rank.
 *
 * Reads only the entries already filtered down to `free` (actionable,
 * not claimed elsewhere) — never the whole proposals tree — so this
 * stays a bounded, small batch of extra file reads instead of an
 * O(all proposals) scan.
 *
 * A missing or unparsable file degrades to "no override/boost", never
 * throws. The cascade resolver can then rank the proposal with just
 * the prefix-derived kind.
 */
export const buildCascadeSummary = async (
	entry: IProposalIndexEntry,
	indexPath: string,
): Promise<IProposalSummary> => {
	const prefix = familyOf(entry.id);
	const kind = PROPOSAL_KIND_BY_PREFIX[prefix] ?? LEGACY_ALIAS_PREFIX;
	const docPath = join(dirname(indexPath), entry.file);
	const markdown = await readTextOrNull(docPath);
	if (markdown === null) return { id: entry.id, kind };
	const frontmatter = parseProposalFrontmatter(markdown);
	const override = parseOverride(frontmatter.cascadeOverride);
	const boost = parseCascadeBoost(frontmatter.cascadeBoost);
	return {
		id: entry.id,
		kind,
		...(override !== undefined ? { cascadeOverride: override } : {}),
		...(frontmatter.cascadeOverrideReason
			? { cascadeOverrideReason: frontmatter.cascadeOverrideReason }
			: {}),
		...(boost !== undefined ? { cascadeBoost: boost } : {}),
	};
};

// ---------------------------------------------------------------------------
// Internal helpers.
// ---------------------------------------------------------------------------

/**
 * Extract the kind-prefix from a proposal id (`q00001` → `q`,
 * `f00049` → `f`, `p99999` → `p`). Empty string for ids with no
 * letter prefix.
 */
const familyOf = (id: string): string => id.match(/^[a-z]+/i)?.[0] ?? '';

/**
 * Parse the frontmatter `cascadeOverride` field into a finite number,
 * or `undefined` when the value is missing/invalid. A non-numeric or
 * non-finite value is treated as "no override" (the cascade falls back
 * to the kind-based rank), matching the pre-refactor behaviour.
 */
const parseOverride = (raw: string | undefined): number | undefined => {
	if (raw === undefined || raw.trim() === '') return undefined;
	const n = Number(raw);
	return Number.isFinite(n) ? n : undefined;
};

const CASCADE_BOOSTS: ReadonlySet<TCascadeBoost> = new Set([
	'shipped-blocking',
	'customer-reported',
	'security',
] as const satisfies readonly TCascadeBoost[]);

/**
 * Tolerant parse for the frontmatter `cascadeBoost` field. Returns the
 * valid TCascadeBoost or `undefined` when the value is missing/unknown.
 * The cascade resolver treats undefined as "no boost".
 */
const parseCascadeBoost = (
	value: string | undefined,
): TCascadeBoost | undefined =>
	typeof value === 'string' && CASCADE_BOOSTS.has(value as TCascadeBoost)
		? (value as TCascadeBoost)
		: undefined;

// Re-export the priority resolver type so consumers can import it
// from the same module they get the summary builder from. Keeps the
// dependency graph clean — one import, two types.
export type { ICascadePriorityResolver };
