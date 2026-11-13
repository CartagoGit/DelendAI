/**
 * proposal-kind.schema.ts — the prefix taxonomy as executable schema
 * (f00114, promoted from f00050 S-G).
 *
 * The kinds/prefixes were already typed constants
 * (`PROPOSAL_KINDS` / `PROPOSAL_PREFIX_BY_KIND` /
 * `PROPOSAL_KIND_BY_PREFIX`), but nothing validated a frontmatter
 * `kind:` string or an `id:` prefix with a Zod schema at the parse and
 * authoring seams. This module derives the schemas FROM those constants
 * (single source, never a duplicated list) and exports them through the
 * plugin's public barrel.
 *
 * Two id schemas on purpose:
 *
 *   - `proposalIdSchema` (READ seam): tolerant of the historical forms
 *     that live in the tree today — the retired `p` legacy alias and
 *     the single residual-letter suffix (`f00067a`). Parsers use it so
 *     the 200+ existing proposals keep loading.
 *   - `newProposalIdSchema` (WRITE seam): strict `<prefix><5 digits>`,
 *     no alias, no suffix. Authoring uses it so no new historical form
 *     is ever minted again.
 *
 * NOTE (recorded deviation from the parked S-G text): the enum exports
 * from `@delendai/proposals`, NOT `@delendai/core` — proposal
 * vocabulary in the core would break AGENTS.md rule #1 (core agnostic).
 */
import z from 'zod';

import {
	PROPOSAL_KIND_BY_PREFIX,
	PROPOSAL_KINDS,
	PROPOSAL_PREFIX_BY_KIND,
	type IProposalKind,
} from '../constants/proposal-glossary.constant';

/** The canonical kind names, derived from the glossary at module load. */
export const PROPOSAL_KIND_VALUES = Object.keys(PROPOSAL_KINDS) as [
	IProposalKind,
	...IProposalKind[],
];

/** `kind:` frontmatter / tool-arg validator (closed enum, derived). */
export const proposalKindSchema = z.enum(PROPOSAL_KIND_VALUES);

/**
 * Canonical id shape plus the historical forms that exist on disk:
 * `p*` (retired legacy alias, still resolvable read-only), a single
 * residual-letter suffix (`f00067a`, a proposal split off f00067 S1),
 * and the short pre-f00016 legacy numbers (`l99`, `l100`, …) — hence
 * `\d+`, not `\d{5,}`. New ids never get these forms (see
 * {@link newProposalIdSchema}).
 */
const READ_ID_PATTERN = /^([a-z])(\d+)([a-z])?$/;

/** Strict shape for NEWLY minted ids: one known prefix + 5 digits. */
const NEW_ID_PATTERN = /^([a-z])(\d{5})$/;

const knownPrefix = (id: string): boolean =>
	(id[0] ?? '') in PROPOSAL_KIND_BY_PREFIX;

/** READ seam: validates any id the tree may legitimately contain. */
export const proposalIdSchema = z
	.string()
	.regex(
		READ_ID_PATTERN,
		'proposal id must be one lowercase prefix + digits (optional single historical letter suffix)',
	)
	.refine(knownPrefix, {
		message: `proposal id prefix must be a known kind prefix (${Object.keys(PROPOSAL_KIND_BY_PREFIX).join(', ')})`,
	});

/** WRITE seam: validates ids for NEW proposals (no alias, no suffix). */
export const newProposalIdSchema = z
	.string()
	.regex(
		NEW_ID_PATTERN,
		'new proposal ids are one lowercase kind prefix + exactly five digits (e.g. f00001)',
	)
	.refine((id) => knownPrefix(id) && (id[0] ?? '') !== 'p', {
		message:
			'new proposal ids must use a canonical kind prefix (the retired `p` alias is read-only)',
	});

export type IKindIdMatch =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: string };

/**
 * Coherence check between a `kind` and an `id` prefix, with a
 * structured reason on mismatch. `legacy` accepts both its canonical
 * `l` prefix and the retired `p` alias.
 */
export const kindMatchesId = (kind: string, id: string): IKindIdMatch => {
	const kindResult = proposalKindSchema.safeParse(kind);
	if (!kindResult.success) {
		return {
			ok: false,
			reason: `unknown kind "${kind}" — expected one of: ${PROPOSAL_KIND_VALUES.join(', ')}`,
		};
	}
	const idResult = proposalIdSchema.safeParse(id);
	if (!idResult.success) {
		return {
			ok: false,
			reason: `invalid proposal id "${id}" — ${idResult.error.issues[0]?.message ?? 'malformed'}`,
		};
	}
	const prefix = id[0] ?? '';
	const kindForPrefix = PROPOSAL_KIND_BY_PREFIX[prefix];
	if (kindForPrefix !== kindResult.data) {
		return {
			ok: false,
			reason: `id prefix "${prefix}" (kind=${String(kindForPrefix)}) does not match kind "${kind}" (prefix "${PROPOSAL_PREFIX_BY_KIND[kindResult.data]}")`,
		};
	}
	return { ok: true };
};
