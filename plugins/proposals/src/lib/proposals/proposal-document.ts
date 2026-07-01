/**
 * proposal-document.ts
 *
 * Canonical parser for the host project proposal markdown files.
 * Entry point: `parseProposalDocument(absolutePath)`.
 *
 * Shape produced: `IProposalDocument` with a typed `frontmatter` section
 * (validated by Zod at runtime) and a `body` section extracted from the
 * markdown headings.
 */

import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { extractYamlBlock, parseFrontmatterBlock } from './frontmatter-parser';
import type { IYamlValue } from './frontmatter-parser';
import type { IProposalBudget } from './proposal-budget';
import { ProposalParseError } from './proposal-errors';

// ---------------------------------------------------------------------------
// Closed union for `acceptanceCriteria[].expect`.
// Use `as const` + union — no native enums (project rule).
// ---------------------------------------------------------------------------

const EXPECT_LITERALS = ['exit0', 'pass', 'synchronized'] as const;

export type IExpectLiteral = (typeof EXPECT_LITERALS)[number];

/** Valid `expect` value for an IAcceptanceCriterion. */
export type IExpectValue = IExpectLiteral | `contains:${string}`;

// ---------------------------------------------------------------------------
// Interfaces — prefix I required by project rule.
// ---------------------------------------------------------------------------

// IProposalBudget is defined in proposal-budget.ts (canonical location).
// Re-export it for consumers who import from proposal-document.
export type { IProposalBudget } from './proposal-budget';

export interface IAcceptanceCriterion {
	readonly command: string;
	readonly expect: IExpectValue;
	readonly timeoutMs?: number;
}

export interface IOwnershipEntry {
	readonly agent: string;
	readonly task: string;
	readonly files?: readonly string[];
}

/**
 * A child referenced from a `plan` proposal's `contains:` block. The
 * parser stores each entry as the raw key/value map (id, kind, required…)
 * and normalises to this shape for the closure evaluator.
 */
export interface IPlanChild {
	readonly id: string;
	readonly kind?: string;
	readonly required?: boolean;
	readonly title?: string;
}

/**
 * A plan's `contains:` block. Each list is optional; a plan may carry
 * only proposals, only sub-plans, only its own slices, or any mix.
 */
export interface IPlanContains {
	readonly proposals?: readonly IPlanChild[];
	readonly plans?: readonly IPlanChild[];
	readonly slices?: readonly IPlanChild[];
}

/**
 * A plan's `closureGate:` block. All three flags default to `true`
 * in the closure evaluator when the block is absent — the strictest
 * closure is the safe default.
 */
export interface IPlanClosureGate {
	readonly requirePeerReview?: boolean;
	readonly requireAllSlicesDone?: boolean;
	readonly requireAllChildrenDone?: boolean;
}

export interface IProposalFrontmatter {
	readonly id: string;
	readonly type: string;
	readonly status: string;
	readonly track: string;
	readonly budget?: IProposalBudget;
	readonly acceptanceCriteria?: readonly IAcceptanceCriterion[];
	/**
	 * Ownership entries. The parser normalises all forms to `IOwnershipEntry`
	 * shape (filling empty strings for missing `agent`/`task` fields).
	 */
	readonly ownership?: readonly IOwnershipEntry[];
	readonly reservedFiles?: readonly string[];
	/**
	 * Plan-of-plans children (q00001). Only set on `type: plan` proposals;
	 * ignored otherwise by the cascade and the closure evaluator.
	 */
	readonly contains?: IPlanContains;
	readonly closureGate?: IPlanClosureGate;
}

export interface IProposalBody {
	/** First paragraph / goal statement extracted from the title heading. */
	readonly goal: string;
	/** Prose under the ## Motivation / ## Description heading. */
	readonly motivation: string;
	/** Bullet items or paragraphs under ## Goals. */
	readonly goals: readonly string[];
	/** Bullet items or paragraphs under ## Non-Goals. */
	readonly nonGoals: readonly string[];
	/** Lines under ## Criterio de cierre. */
	readonly closureCriteria: readonly string[];
}

export interface IProposalDocument {
	readonly path: string;
	readonly frontmatter: IProposalFrontmatter;
	readonly body: IProposalBody;
}

// ---------------------------------------------------------------------------
// Zod schemas for runtime validation (no `as any` — project rule).
// ---------------------------------------------------------------------------

const budgetSchema = z.object({
	maxInputTokens: z.number().min(0).optional(),
	maxOutputTokens: z.number().min(0).optional(),
	maxIterations: z.number().min(0).optional(),
	maxToolCalls: z.number().min(0).optional(),
	maxPremiumCalls: z.number().min(0).optional(),
});

const expectSchema = z
	.string()
	.refine(
		(v): v is IExpectValue =>
			(EXPECT_LITERALS as readonly string[]).includes(v) ||
			v.startsWith('contains:'),
		{
			message:
				'expect must be one of: exit0, pass, synchronized, contains:<substring>',
		},
	);

const criterionSchema = z.object({
	command: z.string().min(1, 'command must not be empty'),
	expect: expectSchema,
	timeoutMs: z.number().optional(),
});

const zombiePolicySchema = z
	.object({
		adopted: z.boolean().optional(),
		continuityPolicy: z
			.object({
				zombieRecovery: z.string().optional(),
			})
			.optional(),
	})
	.superRefine((data, ctx) => {
		if (data.adopted === true) {
			const recovery = data.continuityPolicy?.zombieRecovery;
			if (typeof recovery !== 'string' || recovery.trim() === '') {
				ctx.addIssue({
					code: 'custom',
					path: ['continuityPolicy', 'zombieRecovery'],
					message:
						'proposals with adopted delegation must declare continuityPolicy.zombieRecovery',
				});
			}
		}
	});

// ---------------------------------------------------------------------------
// Body parser — best-effort extraction from markdown headings.
// ---------------------------------------------------------------------------

/**
 * Extracts the content of a `## Heading` section from a markdown body.
 * Returns lines as a trimmed string array, stripping list markers.
 */
const extractSection = (body: string, heading: string): string[] => {
	const headingRe = new RegExp(`^##\\s+${heading}\\s*$`, 'm');
	const nextHeadingRe = /^##\s+/m;

	const start = body.search(headingRe);
	if (start === -1) return [];

	const afterHeading = body.slice(start).split('\n').slice(1).join('\n');
	const nextMatch = afterHeading.search(nextHeadingRe);
	const section =
		nextMatch === -1 ? afterHeading : afterHeading.slice(0, nextMatch);

	return section
		.split('\n')
		.map((l) => l.replace(/^[-*]\s+/, '').trim())
		.filter((l) => l.length > 0 && !l.startsWith('#'));
};

const parseBody = (raw: string): IProposalBody => {
	// Strip frontmatter block; body starts after the closing ---.
	const bodyText = raw.replace(/^---\n[\s\S]*?\n---\n?/, '').trimStart();

	// Extract the document goal: prefer paragraph directly after H1; fall back
	// to the ## Description section when nothing sits between H1 and first ##.
	const h1Match = bodyText.match(
		/^#\s[^\n]*\n+([\s\S]*?)(?=^##|(?![\s\S]))/m,
	);
	const h1Goal = h1Match ? (h1Match[1]?.trim() ?? '') : '';
	const goal = h1Goal || extractSection(bodyText, 'Description').join(' ');

	return {
		goal,
		motivation: extractSection(bodyText, 'Motivation').join(' '),
		goals: extractSection(bodyText, 'Goals'),
		nonGoals: extractSection(bodyText, 'Non-Goals'),
		closureCriteria: extractSection(bodyText, 'Criterio de cierre'),
	};
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads and parses a proposal markdown file, returning a fully typed
 * `IProposalDocument`. Throws `ProposalParseError` for any validation
 * failure (missing frontmatter, invalid budget, invalid criterion).
 *
 * @param absolutePath Absolute path to the `.md` file.
 */
export const parseProposalDocument = async (
	absolutePath: string,
): Promise<IProposalDocument> => {
	const raw = await readFile(absolutePath, 'utf8');

	const block = extractYamlBlock(raw);
	if (block === null) {
		throw new ProposalParseError(
			'INVALID_FRONTMATTER',
			absolutePath,
			`No YAML frontmatter block found in: ${absolutePath}`,
		);
	}

	const parsed = parseFrontmatterBlock(block);

	// --- Zombie Policy validation ---
	zombiePolicySchema.parse(parsed);

	// --- Budget validation ---
	let budget: IProposalBudget | undefined;
	if (parsed.budget !== undefined && parsed.budget !== null) {
		const result = budgetSchema.safeParse(parsed.budget);
		if (!result.success) {
			throw new ProposalParseError(
				'INVALID_BUDGET',
				absolutePath,
				`Invalid budget in ${absolutePath}: ${result.error.message}`,
			);
		}
		// Safe cast: Zod has validated the shape; exactOptionalPropertyTypes
		// requires the assertion because Zod infers optional fields as
		// `?: T | undefined` while IProposalBudget uses the strict `?: T` form.
		budget = result.data as IProposalBudget;
	}

	// --- Acceptance criteria validation ---
	let acceptanceCriteria: readonly IAcceptanceCriterion[] | undefined;
	if (parsed.acceptanceCriteria !== undefined) {
		if (!Array.isArray(parsed.acceptanceCriteria)) {
			throw new ProposalParseError(
				'INVALID_CRITERION',
				absolutePath,
				`acceptanceCriteria must be an array in: ${absolutePath}`,
			);
		}
		const result = z
			.array(criterionSchema)
			.safeParse(parsed.acceptanceCriteria);
		if (!result.success) {
			throw new ProposalParseError(
				'INVALID_CRITERION',
				absolutePath,
				`Invalid acceptance criterion in ${absolutePath}: ${result.error.message}`,
			);
		}
		// Safe cast: same reason as budget — Zod optional fields vs
		// IAcceptanceCriterion.timeoutMs with exactOptionalPropertyTypes.
		acceptanceCriteria = result.data as readonly IAcceptanceCriterion[];
	}

	// --- Ownership / reserved files ---
	const ownership = Array.isArray(parsed.ownership)
		? (parsed.ownership as IYamlValue[])
				.filter(
					(v): v is Record<string, IYamlValue> =>
						typeof v === 'object' &&
						v !== null &&
						!Array.isArray(v),
				)
				.map((item) => ({
					agent: String(item.agent ?? ''),
					task: String(item.task ?? ''),
					...(Array.isArray(item.files)
						? {
								files: (item.files as IYamlValue[]).filter(
									(v): v is string => typeof v === 'string',
								),
							}
						: {}),
				}))
		: undefined;

	const reservedFiles = Array.isArray(parsed.reservedFiles)
		? (parsed.reservedFiles as string[]).filter(
				(v): v is string => typeof v === 'string',
			)
		: undefined;

	const frontmatter: IProposalFrontmatter = {
		id: String(parsed.id ?? ''),
		type: String(parsed.type ?? 'unspecified'),
		status: String(parsed.status ?? 'pending'),
		track: String(parsed.track ?? 'unspecified'),
		...(budget !== undefined ? { budget } : {}),
		...(acceptanceCriteria !== undefined ? { acceptanceCriteria } : {}),
		...(ownership !== undefined ? { ownership } : {}),
		...(reservedFiles !== undefined ? { reservedFiles } : {}),
	};

	const body = parseBody(raw);

	return { path: absolutePath, frontmatter, body };
};
