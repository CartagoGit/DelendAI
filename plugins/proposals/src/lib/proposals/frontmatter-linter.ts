/**
 * frontmatter-linter.ts
 *
 * Pure frontmatter validation extracted from `proposal-scaffold-linter.ts`.
 * Owns ONLY the question "given a proposal's raw markdown, what is
 * wrong with its YAML frontmatter?" — required fields, kind/status
 * known-values, id regex, cascadeOverride/Reason consistency, etc.
 *
 * SRP: no filename logic, no body-section linting, no slice linting
 * — those live in their own modules. This file is a pure function
 * over `(markdown) → { issues, frontmatter }`.
 *
 * Pre-refactor: the 130-line `lintFrontmatter` was a private helper
 * inside `proposal-scaffold-linter.ts` (881 lines total, mixing 6
 * responsibilities). Extracting it here:
 *   - lets the orchestrator (`proposal-scaffold-linter.ts`) shrink to
 *     a thin composer that wires together the 5 cohesive lint modules,
 *   - lets a future `frontmatter_lint` standalone tool (without
 *     body linting) reuse this exact projection,
 *   - lets tests cover the frontmatter rules without booting the
 *     full scaffold lint.
 *
 * Pure: no I/O, no globals, no Date.now, no Math.random.
 */

import { extractYamlBlock, parseFrontmatterBlock } from './frontmatter-parser';
import {
	PROPOSAL_KINDS,
	PROPOSAL_STATUSES,
} from '../contracts/constants/proposal-glossary.constant';

// ---------------------------------------------------------------------------
// Public types — shared with the rest of the linter surface.
// ---------------------------------------------------------------------------

export interface ILintIssue {
	/** 1-based line number in the source markdown, or 0 for file-level issues. */
	readonly line: number;
	readonly message: string;
	readonly fix: string;
}

export interface ILintFrontmatterResult {
	readonly issues: readonly ILintIssue[];
	readonly frontmatter: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Constants — closed sets shared with the rest of the proposals plugin.
// ---------------------------------------------------------------------------

const REQUIRED_STRING_FIELDS: readonly string[] = [
	'id',
	'kind',
	'title',
	'status',
	'date',
	'track',
];

const ID_RE = /^[a-z]\d{5}$/;

const CASCADE_BOOST_VALUES: ReadonlySet<string> = new Set([
	'shipped-blocking',
	'customer-reported',
	'security',
]);

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * Validate the YAML frontmatter block of a proposal markdown. Returns
 * the parsed frontmatter alongside any issues. Never throws — a
 * missing or corrupt block degrades to "one fatal issue, empty
 * frontmatter" so the orchestrator can still run the rest of the
 * lint pass.
 */
export const lintFrontmatter = (markdown: string): ILintFrontmatterResult => {
	const block = extractYamlBlock(markdown);
	if (block === null) {
		return {
			issues: [
				{
					line: 0,
					message: 'no YAML frontmatter block found',
					fix: 'Add a `---`-delimited frontmatter block at the top of the file.',
				},
			],
			frontmatter: {},
		};
	}

	const frontmatter = parseFrontmatterBlock(block) as Record<string, unknown>;
	const issues: ILintIssue[] = [];

	checkRequiredStringFields(frontmatter, issues);
	checkKindKnown(frontmatter, issues);
	checkStatusKnown(frontmatter, issues);
	checkIdShape(frontmatter, issues);
	checkTitleLength(frontmatter, issues);
	checkCascadeOverrideConsistency(frontmatter, issues);
	checkCascadeBoostKnown(frontmatter, issues);
	checkPausedReason(frontmatter, issues);

	return { issues, frontmatter };
};

// ---------------------------------------------------------------------------
// Individual checks — each is a focused, named rule. The order below
// matches the pre-refactor behaviour (required → kind → status → id →
// title → cascade override → cascade boost). Reordering changes the
// issue list order but not the semantics.
// ---------------------------------------------------------------------------

const checkRequiredStringFields = (
	fm: Readonly<Record<string, unknown>>,
	issues: ILintIssue[],
): void => {
	for (const field of REQUIRED_STRING_FIELDS) {
		const value = fm[field];
		if (typeof value !== 'string' || value === '') {
			issues.push({
				line: 0,
				message: `frontmatter is missing required field "${field}"`,
				fix: `Add "${field}: <value>" to the frontmatter.`,
			});
		}
	}
};

const checkKindKnown = (
	fm: Readonly<Record<string, unknown>>,
	issues: ILintIssue[],
): void => {
	if (typeof fm.kind === 'string' && !(fm.kind in PROPOSAL_KINDS)) {
		issues.push({
			line: 0,
			message: `frontmatter kind "${fm.kind}" is not one of the ${
				Object.keys(PROPOSAL_KINDS).length
			} known kinds`,
			fix: `Use one of: ${Object.keys(PROPOSAL_KINDS).join(', ')}.`,
		});
	}
};

const checkStatusKnown = (
	fm: Readonly<Record<string, unknown>>,
	issues: ILintIssue[],
): void => {
	if (typeof fm.status === 'string' && !(fm.status in PROPOSAL_STATUSES)) {
		issues.push({
			line: 0,
			message: `frontmatter status "${fm.status}" is not one of the ${
				Object.keys(PROPOSAL_STATUSES).length
			} known statuses`,
			fix: `Use one of: ${Object.keys(PROPOSAL_STATUSES).join(', ')}.`,
		});
	}
};

const checkIdShape = (
	fm: Readonly<Record<string, unknown>>,
	issues: ILintIssue[],
): void => {
	if (typeof fm.id === 'string' && !ID_RE.test(fm.id)) {
		issues.push({
			line: 0,
			message: `frontmatter id "${fm.id}" does not match /^[a-z]\\d{5}$/`,
			fix: 'Use a single lowercase letter followed by exactly 5 digits (e.g. f00014).',
		});
	}
};

const checkTitleLength = (
	fm: Readonly<Record<string, unknown>>,
	issues: ILintIssue[],
): void => {
	if (typeof fm.title === 'string' && fm.title.length < 8) {
		issues.push({
			line: 0,
			message: 'frontmatter title is shorter than 8 characters',
			fix: 'Write a more descriptive title.',
		});
	}
};

/**
 * f00024: cascadeOverride is a break-glass that pins a proposal to an
 * absolute cascade priority. It must always carry an audit-trail
 * reason (logged by `proposal_auto_work` and surfaced in
 * `get_proposal_workflow` diagnostics), and the runtime resolver
 * already throws when the reason is missing — the linter closes
 * the authoring gap so the runtime error never fires in production.
 *
 * A reason without an override is a dangling field — either the
 * override was removed and the reason forgotten, or the override
 * was never added. Either way, treat as fatal so the frontmatter
 * never claims an audit trail that the cascade never applied.
 */
const checkCascadeOverrideConsistency = (
	fm: Readonly<Record<string, unknown>>,
	issues: ILintIssue[],
): void => {
	if ('cascadeOverride' in fm) {
		const override = fm.cascadeOverride;
		if (typeof override !== 'number' || !Number.isFinite(override)) {
			issues.push({
				line: 0,
				message: `frontmatter cascadeOverride must be a finite number (got ${typeof override})`,
				fix: 'Use a finite numeric priority (negative numbers rank higher in the cascade).',
			});
		}
		const reason = fm.cascadeOverrideReason;
		if (typeof reason !== 'string' || reason.trim().length < 4) {
			issues.push({
				line: 0,
				message:
					'frontmatter cascadeOverride is set but cascadeOverrideReason is missing or too short',
				fix: 'Add `cascadeOverrideReason: <human-readable rationale>` to the frontmatter so `proposal_auto_work` can log the audit trail.',
			});
		}
	} else if ('cascadeOverrideReason' in fm) {
		issues.push({
			line: 0,
			message:
				'frontmatter cascadeOverrideReason is set but cascadeOverride is missing',
			fix: 'Either add `cascadeOverride: <number>` or remove the dangling `cascadeOverrideReason`.',
		});
	}
};

/**
 * f00024: cascadeBoost is an intra-kind nudge. The union is closed
 * (extensible only by editing `TCascadeBoost` in `cascade-priority.ts`),
 * so an unknown value would silently fall through to no-op at runtime
 * — catch it here instead of letting it rot.
 */
const checkCascadeBoostKnown = (
	fm: Readonly<Record<string, unknown>>,
	issues: ILintIssue[],
): void => {
	if (!('cascadeBoost' in fm)) return;
	const boost = fm.cascadeBoost;
	if (typeof boost !== 'string' || !CASCADE_BOOST_VALUES.has(boost)) {
		issues.push({
			line: 0,
			message: `frontmatter cascadeBoost "${String(boost)}" is not one of the allowed values`,
			fix: `Use one of: ${[...CASCADE_BOOST_VALUES].join(', ')}. Unknown values silently no-op at runtime.`,
		});
	}
};

const checkPausedReason = (
	fm: Readonly<Record<string, unknown>>,
	issues: ILintIssue[],
): void => {
	if (fm.status === 'paused') {
		const reason = fm['paused-reason'] ?? fm.pausedReason;
		if (typeof reason !== 'string' || reason.trim() === '') {
			issues.push({
				line: 0,
				message:
					'frontmatter status is "paused" but "paused-reason" is missing or empty',
				fix: 'Add `paused-reason: <explanation of why the proposal is paused>` to the frontmatter.',
			});
		}
	}
};
