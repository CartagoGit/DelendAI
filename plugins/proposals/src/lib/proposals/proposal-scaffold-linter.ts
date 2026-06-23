/**
 * f00016 S2 — validates a proposal `.md` against the canonical scaffold
 * (f00016 §4.5): frontmatter shape, body section order, filename↔kind,
 * folder↔status, and the two equivalent slice formats (terse / narrative).
 *
 * Pure: takes the raw markdown + its path, returns issues. No I/O — the
 * caller (the `lint:proposals` script, S3) does the file walking.
 */
import { lintFilenameAndFolder } from './filename-linter';
import { lintFrontmatter } from './frontmatter-linter';
import type { ILintIssue } from './frontmatter-linter';
import {
	createDefaultNarrativePatternProvider,
	type INarrativePatternProvider,
} from './proposal-narrative-patterns';

export type { ILintIssue } from './frontmatter-linter';
export type {
	INarrativeAliasEntry,
	INarrativePatternProvider,
} from './proposal-narrative-patterns';
export {
	createDefaultNarrativePatternProvider,
	createEmptyNarrativePatternProvider,
	createNarrativePatternProvider,
} from './proposal-narrative-patterns';

export interface ILintResult {
	readonly ok: boolean;
	readonly issues: readonly ILintIssue[];
}

// Canonical top-level section sequences (f00016 §4.5).
// Standard proposals and audits have different required sections and canonical order.
const PROPOSAL_REQUIRED_SECTIONS = [
	'goal',
	'why',
	'non-goals',
	'slices',
	'acceptance',
] as const;

const PROPOSAL_CANONICAL_ORDER = [
	'goal',
	'why',
	'why this design',
	'non-goals',
	'architecture',
	'slices',
	'dependency graph',
	'acceptance',
	'risks and mitigations',
	'notes',
];

const AUDIT_REQUIRED_SECTIONS = [
	'goal',
	'why',
	'non-goals',
	'slices',
	'acceptance',
	'verified state',
	'findings',
	'scoreboard',
] as const;

const AUDIT_CANONICAL_ORDER = [
	'goal',
	'why',
	'non-goals',
	'slices',
	'acceptance',
	'verified state',
	'findings',
	'scoreboard',
	'notes',
];

const normalizeHeading = (raw: string): string =>
	raw
		.replace(/^#{1,6}\s*/, '')
		.replace(/^\d+\.\s*/, '')
		.trim()
		.toLowerCase();

/**
 * Map a normalised heading to its canonical section name. Returns
 * `null` when the heading is not recognised (neither in the canonical
 * list nor in the injected narrative aliases).
 *
 * r00003 S7 (F2): the narrative aliases are no longer a module-level
 * constant baked into this file — they come from an injected
 * `INarrativePatternProvider`, so the linter stays agnostic and a host
 * supplies (or omits) its own narrative vocabulary.
 */
const resolveCanonicalSection = (
	normalized: string,
	aliases: Readonly<Record<string, readonly string[]>>,
): string | null => {
	if (PROPOSAL_CANONICAL_ORDER.includes(normalized)) return normalized;
	if (AUDIT_CANONICAL_ORDER.includes(normalized)) return normalized;
	const aliased = aliases[normalized];
	// Aliases are ordered: the first entry is the canonical default.
	// Subsequent entries record divergent historical mappings that
	// accumulated as the catalogue grew (different authors/readers
	// classified the same heading differently) — they're preserved so
	// future audit tooling can still surface them.
	return aliased?.[0] ?? null;
};

interface IHeadingMatch {
	readonly line: number;
	readonly raw: string;
	readonly normalized: string;
}

/**
 * `true` at index `i` means line `i` (0-based) is inside a fenced code
 * block (```...```). Headings/slices written as illustrative examples
 * inside a fence (this linter's own §4.5 documents the scaffold using
 * `markdown` fences full of literal `## Goal` lines) must not be parsed
 * as real document structure.
 */
const computeFencedLineMask = (lines: readonly string[]): boolean[] => {
	// A CommonMark fenced code block opens with a run of ≥3 backticks
	// (optionally followed by an info string) on a line by itself, and
	// closes with a run of backticks at least as long as the opener.
	// A fence of 4+ backticks lets authors embed 3-backtick spans
	// inside (e.g. an example that documents code itself). The previous
	// implementation only matched exactly 3 backticks and toggled the
	// state on every match, so a 4-backtick block counted as two
	// open/close pairs and the rest of the file was treated as
	// "inside" — which is why headings like `## acceptance` got
	// missed.
	const mask: boolean[] = [];
	let fenceRun = 0; // length of the open fence, 0 when outside any
	for (const line of lines) {
		const trimmed = line.trim();
		const m = /^(```+)(.*)$/.exec(trimmed);
		if (m) {
			const run = m[1]?.length ?? 0;
			if (fenceRun === 0) {
				// Opening fence.
				fenceRun = run;
				mask.push(true); // the delimiter line itself is "inside"
			} else if (run >= fenceRun && (m[2] ?? '').trim() === '') {
				// Closing fence: at least as many backticks, no info string.
				fenceRun = 0;
				mask.push(true);
			} else {
				// Looks like a fence but doesn't close — treat as content.
				mask.push(fenceRun > 0);
			}
			continue;
		}
		mask.push(fenceRun > 0);
	}
	return mask;
};

const findH2Headings = (markdown: string): IHeadingMatch[] => {
	const lines = markdown.split('\n');
	const fenced = computeFencedLineMask(lines);
	const out: IHeadingMatch[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (fenced[i]) continue;
		const line = lines[i] ?? '';
		if (/^##\s+/.test(line) && !/^###/.test(line)) {
			out.push({
				line: i + 1,
				raw: line,
				normalized: normalizeHeading(line),
			});
		}
	}
	return out;
};

const lintSections = (
	markdown: string,
	aliases: Readonly<Record<string, readonly string[]>>,
	kind?: string,
): ILintIssue[] => {
	const canonicalOrder =
		kind === 'audit' ? AUDIT_CANONICAL_ORDER : PROPOSAL_CANONICAL_ORDER;
	const requiredSections =
		kind === 'audit' ? AUDIT_REQUIRED_SECTIONS : PROPOSAL_REQUIRED_SECTIONS;
	const canonicalIndex = (name: string): number =>
		canonicalOrder.indexOf(name);

	const issues: ILintIssue[] = [];
	const headings = findH2Headings(markdown);
	// `seen` is keyed by the *resolved canonical* section name, so a
	// narrative heading aliased to `notes` and a literal `## notes`
	// collide as one section (and trigger the duplicate-section lint).
	const seen = new Map<string, IHeadingMatch>();

	for (const h of headings) {
		const resolved = resolveCanonicalSection(h.normalized, aliases);
		if (resolved === null) {
			issues.push({
				line: h.line,
				message: `unrecognized section heading "${h.raw.trim()}" — not part of the canonical scaffold`,
				fix: `Rename to one of: ${canonicalOrder.join(', ')} (a leading "N. " is fine).`,
			});
			continue;
		}
		if (seen.has(resolved)) {
			issues.push({
				line: h.line,
				message: `duplicate section "${resolved}"`,
				fix: 'Merge the duplicate sections into one.',
			});
			continue;
		}
		seen.set(resolved, h);
	}

	for (const required of requiredSections) {
		if (!seen.has(required)) {
			issues.push({
				line: 0,
				message: `missing required section "${required}"`,
				fix: `Add a "## ${required}" section.`,
			});
		}
	}

	// Order: the canonical-index sequence of the headings actually present
	// (known ones only) must be non-decreasing. We use the *resolved*
	// canonical name so that a narrative heading aliased to, e.g.,
	// `notes` is compared against the canonical position of `notes`.
	const present = headings
		.map((h) => ({
			h,
			resolved: resolveCanonicalSection(h.normalized, aliases),
		}))
		.filter(
			(x): x is { h: IHeadingMatch; resolved: string } =>
				x.resolved !== null,
		);
	for (let i = 1; i < present.length; i++) {
		const prev = present[i - 1];
		const curr = present[i];
		if (!prev || !curr) continue;
		if (canonicalIndex(curr.resolved) < canonicalIndex(prev.resolved)) {
			issues.push({
				line: curr.h.line,
				message: `section "${curr.resolved}" appears after "${prev.resolved}", out of canonical order`,
				fix: `Reorder so the sections follow: ${canonicalOrder.join(' → ')}.`,
			});
		}
	}

	return issues;
};

interface ISliceCheck {
	readonly sliceLine: number;
	readonly title: string;
}

const findSliceHeadings = (markdown: string): ISliceCheck[] => {
	const lines = markdown.split('\n');
	const fenced = computeFencedLineMask(lines);
	const out: ISliceCheck[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (fenced[i]) continue;
		const line = lines[i] ?? '';
		const m = line.match(/^###\s+(S\d+)\s+—\s+(.+)$/);
		if (m) out.push({ sliceLine: i + 1, title: line.trim() });
	}
	return out;
};

/**
 * A slice block runs from its heading to the next `##`/`###` heading (or
 * EOF). Resolves to the four logical fields under either format (f00016
 * §4.5): terse (`**Files**`/`**Command**`/`**Expect**` bullets) or
 * narrative (`(excl. ...)` in the heading + `**Gate**` bullet, which
 * combines Command + an implicit `Expect: exit0`).
 */
const lintSlice = (
	markdown: string,
	slice: ISliceCheck,
	nextHeadingLine: number,
): ILintIssue[] => {
	const issues: ILintIssue[] = [];
	const lines = markdown.split('\n');
	const block = lines.slice(slice.sliceLine, nextHeadingLine - 1).join('\n');

	const hasStatus = /\*\*Status\*\*:/.test(block);
	const hasFilesField = /\*\*Files\*\*:/.test(block);
	const hasCommandField = /\*\*Command\*\*:/.test(block);
	const hasExpectField = /\*\*Expect\*\*:/.test(block);
	const hasExclFiles = /\(excl\.\s*`/.test(slice.title);
	const hasGate = /\*\*Gate\*\*:/.test(block);

	if (!hasStatus) {
		issues.push({
			line: slice.sliceLine,
			message: `slice "${slice.title}" has no **Status** field`,
			fix: 'Add `- **Status**: pending|in-progress|review|done`.',
		});
	}

	const filesResolved = hasFilesField || hasExclFiles;
	if (!filesResolved) {
		issues.push({
			line: slice.sliceLine,
			message: `slice "${slice.title}" does not resolve a Files field (no **Files** bullet, no "(excl. ...)" in the heading)`,
			fix: 'Add `- **Files**: [...]` or list the files in `(excl. `path`, ...)` in the heading.',
		});
	}

	const commandExpectResolved =
		(hasCommandField && hasExpectField) || hasGate;
	if (!commandExpectResolved) {
		issues.push({
			line: slice.sliceLine,
			message: `slice "${slice.title}" does not resolve Command+Expect (no **Command**/**Expect** pair, no **Gate**)`,
			fix: 'Add `- **Command**: ...` + `- **Expect**: ...`, or a single `- **Gate**: <command>` (implies Expect: exit0).',
		});
	}

	return issues;
};

const lintSlices = (
	markdown: string,
	aliases: Readonly<Record<string, readonly string[]>>,
): ILintIssue[] => {
	const issues: ILintIssue[] = [];
	const slices = findSliceHeadings(markdown);
	const lines = markdown.split('\n');

	if (slices.length === 0) {
		// Only an issue if there IS a Slices section at all — lintSections
		// already flags a missing Slices section; an empty one is a
		// separate, narrower problem. `resolveCanonicalSection` covers
		// both literal `## Slices` and narrative aliases (e.g.
		// `## 5. Slices (siguiendo el patrón disjoint)`).
		const hasSlicesSection = findH2Headings(markdown).some(
			(h) => resolveCanonicalSection(h.normalized, aliases) === 'slices',
		);
		if (hasSlicesSection) {
			issues.push({
				line: 0,
				message:
					'the Slices section has no `### S<N> — <title>` entries',
				fix: 'Add at least one slice.',
			});
		}
		return issues;
	}

	for (let i = 0; i < slices.length; i++) {
		const slice = slices[i];
		if (!slice) continue;
		const next = slices[i + 1];
		const nextLine = next ? next.sliceLine : lines.length + 1;
		issues.push(...lintSlice(markdown, slice, nextLine));
	}
	return issues;
};

// `lintFilenameAndFolder` and `lintFrontmatter` are imported from the
// cohesive `filename-linter.ts` / `frontmatter-linter.ts` modules (SRP).
// The orchestrator below just wires them together.
export const lintProposalMarkdown = (args: {
	readonly path: string;
	readonly markdown: string;
	/**
	 * r00003 S7 (F2, DIP): the host's narrative-heading vocabulary. When
	 * omitted, the default provider supplies this repo's historical audit
	 * catalogue so existing proposals keep linting clean; a host that
	 * wants a strict structure-only linter passes an empty provider.
	 */
	readonly narrativePatterns?: INarrativePatternProvider;
}): ILintResult => {
	const provider =
		args.narrativePatterns ?? createDefaultNarrativePatternProvider();
	const aliases = provider.aliases;
	const { issues: frontmatterIssues, frontmatter } = lintFrontmatter(
		args.markdown,
	);
	const kind =
		typeof frontmatter.kind === 'string' ? frontmatter.kind : undefined;
	const issues: ILintIssue[] = [
		...frontmatterIssues,
		...lintFilenameAndFolder(args.path, frontmatter),
		...lintSections(args.markdown, aliases, kind),
		...lintSlices(args.markdown, aliases),
	];
	return { ok: issues.length === 0, issues };
};
