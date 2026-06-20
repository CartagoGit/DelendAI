/**
 * f113 S2 — validates a proposal `.md` against the canonical scaffold
 * (f113 §4.5): frontmatter shape, body section order, filename↔kind,
 * folder↔status, and the two equivalent slice formats (terse / narrative).
 *
 * Pure: takes the raw markdown + its path, returns issues. No I/O — the
 * caller (the `lint:proposals` script, S3) does the file walking.
 */
import { extractYamlBlock, parseFrontmatterBlock } from './frontmatter-parser';
import {
	PROPOSAL_KIND_BY_PREFIX,
	PROPOSAL_KINDS,
	PROPOSAL_STATUSES,
	STATUS_TO_FOLDER,
} from '../contracts/constants/proposal-glossary.constant';
import type {
	IProposalKind,
	IProposalStatus,
} from '../contracts/constants/proposal-glossary.constant';

export interface ILintIssue {
	/** 1-based line number in the source markdown, or 0 for file-level issues. */
	readonly line: number;
	readonly message: string;
	readonly fix: string;
}

export interface ILintResult {
	readonly ok: boolean;
	readonly issues: readonly ILintIssue[];
}

// Canonical top-level section sequence (f113 §4.5): required sections are
// always present and always in this relative order; optional ones occupy a
// fixed slot but may be omitted entirely.
const REQUIRED_SECTIONS = [
	'goal',
	'why',
	'non-goals',
	'slices',
	'acceptance',
] as const;
const OPTIONAL_SECTION_SLOTS: Readonly<Record<string, string>> = {
	'why this design': 'why',
	architecture: 'non-goals',
	'dependency graph': 'slices',
	'risks and mitigations': 'acceptance',
	notes: 'acceptance', // last, after Risks if present, after Acceptance otherwise
};
const CANONICAL_ORDER = [
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
const canonicalIndex = (name: string): number => CANONICAL_ORDER.indexOf(name);

const normalizeHeading = (raw: string): string =>
	raw
		.replace(/^#{1,6}\s*/, '')
		.replace(/^\d+\.\s*/, '')
		.trim()
		.toLowerCase();

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
	const mask: boolean[] = [];
	let inFence = false;
	for (const line of lines) {
		if (/^```/.test(line.trim())) {
			// The fence delimiter line itself counts as "inside" too, so a
			// heading-shaped fence marker line is never mistaken for one.
			mask.push(true);
			inFence = !inFence;
			continue;
		}
		mask.push(inFence);
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

const lintSections = (markdown: string): ILintIssue[] => {
	const issues: ILintIssue[] = [];
	const headings = findH2Headings(markdown);
	const seen = new Map<string, IHeadingMatch>();

	for (const h of headings) {
		const isKnown = canonicalIndex(h.normalized) >= 0;
		if (!isKnown) {
			issues.push({
				line: h.line,
				message: `unrecognized section heading "${h.raw.trim()}" — not part of the canonical scaffold`,
				fix: `Rename to one of: ${CANONICAL_ORDER.join(', ')} (a leading "N. " is fine).`,
			});
			continue;
		}
		if (seen.has(h.normalized)) {
			issues.push({
				line: h.line,
				message: `duplicate section "${h.normalized}"`,
				fix: 'Merge the duplicate sections into one.',
			});
			continue;
		}
		seen.set(h.normalized, h);
	}

	for (const required of REQUIRED_SECTIONS) {
		if (!seen.has(required)) {
			issues.push({
				line: 0,
				message: `missing required section "${required}"`,
				fix: `Add a "## ${required}" section.`,
			});
		}
	}

	// Order: the canonical-index sequence of the headings actually present
	// (known ones only) must be non-decreasing.
	const present = headings.filter((h) => canonicalIndex(h.normalized) >= 0);
	for (let i = 1; i < present.length; i++) {
		const prev = present[i - 1];
		const curr = present[i];
		if (!prev || !curr) continue;
		if (canonicalIndex(curr.normalized) < canonicalIndex(prev.normalized)) {
			issues.push({
				line: curr.line,
				message: `section "${curr.normalized}" appears after "${prev.normalized}", out of canonical order`,
				fix: `Reorder so the sections follow: ${CANONICAL_ORDER.join(' → ')}.`,
			});
		}
	}

	// Optional sections must sit in their declared slot (immediately after
	// the required/optional anchor they're attached to) — checked via the
	// non-decreasing pass above, which already catches misplacement since
	// every section (required or optional) has a fixed CANONICAL_ORDER index.
	void OPTIONAL_SECTION_SLOTS;

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
 * EOF). Resolves to the four logical fields under either format (f113
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

const lintSlices = (markdown: string): ILintIssue[] => {
	const issues: ILintIssue[] = [];
	const slices = findSliceHeadings(markdown);
	const lines = markdown.split('\n');

	if (slices.length === 0) {
		// Only an issue if there IS a Slices section at all — lintSections
		// already flags a missing Slices section; an empty one is a
		// separate, narrower problem.
		const hasSlicesSection = findH2Headings(markdown).some(
			(h) => h.normalized === 'slices',
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

const lintFilenameAndFolder = (
	path: string,
	frontmatter: Record<string, unknown>,
): ILintIssue[] => {
	const issues: ILintIssue[] = [];
	const filename = path.split('/').pop() ?? path;
	const m = filename.match(/^([a-z])(\d{3,})-[a-z0-9-]+\.md$/);
	if (!m) {
		issues.push({
			line: 0,
			message: `filename "${filename}" does not match the canonical pattern`,
			fix: 'Rename to `<prefix><NNN>-<kebab-slug>.md` (lowercase prefix, ≥3 digits).',
		});
		return issues;
	}
	const prefix = m[1] ?? '';
	const kind = frontmatter.kind;
	const kindFromPrefix = PROPOSAL_KIND_BY_PREFIX[prefix];
	if (kindFromPrefix === undefined) {
		issues.push({
			line: 0,
			message: `filename prefix "${prefix}" is not a known kind prefix`,
			fix: `Use one of: ${Object.values(PROPOSAL_KINDS)
				.map((k) => k.prefix)
				.join(', ')} (or the retired legacy "p").`,
		});
	} else if (typeof kind === 'string' && kind !== kindFromPrefix) {
		issues.push({
			line: 0,
			message: `filename starts with "${prefix}" (kind=${kindFromPrefix}) but frontmatter.kind = "${kind}"`,
			fix: `Either rename the file to start with "${
				PROPOSAL_KINDS[kind as IProposalKind]?.prefix ?? '?'
			}", or set frontmatter kind: ${kindFromPrefix}.`,
		});
	}

	const status = frontmatter.status;
	if (typeof status === 'string' && status in PROPOSAL_STATUSES) {
		const expectedFolder = STATUS_TO_FOLDER[status as IProposalStatus];
		const pathParts = path.split('/');
		const actualFolder = pathParts[pathParts.length - 2];
		if (actualFolder !== expectedFolder) {
			issues.push({
				line: 0,
				message: `frontmatter status "${status}" expects folder "${expectedFolder}" but file lives in "${actualFolder}"`,
				fix: `Move the file to docs/proposals/${expectedFolder}/, or update status to match its current folder.`,
			});
		}
	}

	return issues;
};

const lintFrontmatter = (
	markdown: string,
): { issues: ILintIssue[]; frontmatter: Record<string, unknown> } => {
	const issues: ILintIssue[] = [];
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
	const frontmatter = parseFrontmatterBlock(block);

	const requiredStringFields = [
		'id',
		'kind',
		'title',
		'status',
		'date',
		'track',
	];
	for (const field of requiredStringFields) {
		if (
			typeof frontmatter[field] !== 'string' ||
			frontmatter[field] === ''
		) {
			issues.push({
				line: 0,
				message: `frontmatter is missing required field "${field}"`,
				fix: `Add "${field}: <value>" to the frontmatter.`,
			});
		}
	}

	if (
		typeof frontmatter.kind === 'string' &&
		!(frontmatter.kind in PROPOSAL_KINDS)
	) {
		issues.push({
			line: 0,
			message: `frontmatter kind "${frontmatter.kind}" is not one of the 12 known kinds`,
			fix: `Use one of: ${Object.keys(PROPOSAL_KINDS).join(', ')}.`,
		});
	}

	if (
		typeof frontmatter.status === 'string' &&
		!(frontmatter.status in PROPOSAL_STATUSES)
	) {
		issues.push({
			line: 0,
			message: `frontmatter status "${frontmatter.status}" is not one of the 7 known statuses`,
			fix: `Use one of: ${Object.keys(PROPOSAL_STATUSES).join(', ')}.`,
		});
	}

	if (
		typeof frontmatter.id === 'string' &&
		!/^[a-z]\d{3,}$/.test(frontmatter.id)
	) {
		issues.push({
			line: 0,
			message: `frontmatter id "${frontmatter.id}" does not match /^[a-z]\\d{3,}$/`,
			fix: 'Use a single lowercase letter followed by ≥3 digits (e.g. f114).',
		});
	}

	if (typeof frontmatter.title === 'string' && frontmatter.title.length < 8) {
		issues.push({
			line: 0,
			message: 'frontmatter title is shorter than 8 characters',
			fix: 'Write a more descriptive title.',
		});
	}

	return { issues, frontmatter: frontmatter as Record<string, unknown> };
};

export const lintProposalMarkdown = (args: {
	readonly path: string;
	readonly markdown: string;
}): ILintResult => {
	const { issues: frontmatterIssues, frontmatter } = lintFrontmatter(
		args.markdown,
	);
	const issues: ILintIssue[] = [
		...frontmatterIssues,
		...lintFilenameAndFolder(args.path, frontmatter),
		...lintSections(args.markdown),
		...lintSlices(args.markdown),
	];
	return { ok: issues.length === 0, issues };
};
