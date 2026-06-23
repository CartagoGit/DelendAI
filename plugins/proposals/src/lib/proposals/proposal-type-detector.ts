/**
 * proposal-type-detector.ts
 *
 * Pure predicates over a proposal's raw markdown that answer "what
 * kind of proposal is this?". Centralises the frontmatter-shape
 * checks that tools otherwise duplicate.
 *
 * SRP: this module owns ONLY the question "what type is this
 * proposal?". No I/O, no tool logic. Tools (`proposal-transition`,
 * `close-plan`, future `proposal_board` filters) call these
 * predicates once and branch on the result.
 *
 * Pre-refactor: `looksLikePlan` was a private helper inside
 * `proposal-transition.tool.ts`. It was 8 lines that:
 *   - Called `extractYamlBlock` (already an injected dep),
 *   - Called `parseFrontmatterBlock`,
 *   - Compared `fm.type === 'plan'`.
 *
 * Extracting it as `isPlanProposal` + adding companion predicates
 * (`isLegacyProposal`, `isResumeProposal`) gives every tool a uniform
 * vocabulary and removes 4 lines of frontmatter parsing from each
 * call site (DRY).
 *
 * Tolerant by design: a malformed/missing frontmatter returns
 * `false`, never throws. The transition tool relies on this — a
 * proposal with a broken frontmatter is rejected for a different
 * reason (no known status) by `proposal-transition`, not because the
 * type detector panicked.
 */

import { extractYamlBlock, parseFrontmatterBlock } from './frontmatter-parser';

// ---------------------------------------------------------------------------
// Public predicates.
// ---------------------------------------------------------------------------

/** True when the proposal's frontmatter declares `type: plan` (q00001). */
export const isPlanProposal = (raw: string): boolean => {
	const type = readType(raw);
	return type === 'plan';
};

/** True when the proposal's frontmatter declares `type: legacy`. */
export const isLegacyProposal = (raw: string): boolean => {
	const type = readType(raw);
	return type === 'legacy';
};

/** True when the proposal's frontmatter declares `type: resume`. */
export const isResumeProposal = (raw: string): boolean => {
	const type = readType(raw);
	return type === 'resume';
};

/**
 * Read the frontmatter `type` field. Returns the empty string when
 * the frontmatter is missing or has no `type` field. Single source of
 * truth for "what kind of proposal is this?" — every predicate
 * above goes through this helper, so a future tolerance tweak
 * (e.g. case-insensitive `Type:` matching) is a one-line change.
 */
export const readProposalType = (raw: string): string => readType(raw);

/**
 * Read the frontmatter `kind` field. The `kind` is the dispatch key
 * for the cascade (`fix` before `feat`, etc.); the `type` is the
 * proposal shape (`plan`, `feat`, etc.). Two fields, different
 * purposes — keep them separate.
 */
export const readProposalKind = (raw: string): string => {
	const fm = parseFrontmatter(raw);
	if (fm === null) return '';
	const k = fm['kind'];
	return typeof k === 'string' ? k : '';
};

// ---------------------------------------------------------------------------
// Internal helpers.
// ---------------------------------------------------------------------------

const readType = (raw: string): string => {
	const fm = parseFrontmatter(raw);
	if (fm === null) return '';
	const t = fm['type'];
	return typeof t === 'string' ? t : '';
};

const parseFrontmatter = (raw: string): Record<string, unknown> | null => {
	const block = extractYamlBlock(raw);
	if (block === null) return null;
	return parseFrontmatterBlock(block) as Record<string, unknown>;
};
