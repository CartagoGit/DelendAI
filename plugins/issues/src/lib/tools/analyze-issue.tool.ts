/**
 * `<prefix>_issues_analyze` — mechanical pre-analysis only. No LLM, no
 * proposal creation (non-goal, see the proposal's "## non-goals"):
 * this tool loads (or auto-ingests, via `loadOrIngestScaffold` from
 * `ingest-issue.tool.ts` — never re-implemented here) the scaffold for
 * `number` and runs a handful of deterministic heuristics over its
 * frontmatter/body to produce a draft `{ kind, confidence, rationale,
 * bodyMarkdown, suggestedSlices? }`. The host's LLM decides whether to
 * act on the draft via a separate `proposals_create_proposal` call.
 *
 * Heuristics (intentionally simple/mechanical, not NLP):
 * - `labels` containing `bug`/`fix` → `kind: 'fix'`; `feature`/`feat`/
 *   `enhancement` → `kind: 'feat'`; `refactor` → `kind: 'refactor'`;
 *   `chore` → `kind: 'chore'`; `spike`/`research`/`question` →
 *   `kind: 'spike'`.
 * - Body containing "repro steps" / "steps to reproduce"
 *   (case-insensitive) → `kind: 'fix'` (overrides the label guess,
 *   since explicit repro steps are a strong fix signal).
 * - Body containing "would be nice if" / "feature request"
 *   (case-insensitive) → `kind: 'feat'`.
 * - No signal at all → `kind: 'dismiss'` with low confidence (the
 *   draft explicitly suggests the host ask the user for more detail
 *   or dismiss as unclear).
 * - Confidence ceiling: longer, more detailed bodies raise the
 *   ceiling (a one-line issue can never earn high confidence,
 *   regardless of label signal).
 * - Multi-domain heuristic: counts distinct top-level path segments
 *   (e.g. `plugins/issues`, `apps/web`) mentioned in the body; 3 or
 *   more distinct segments suggests the issue spans multiple areas and
 *   should likely be split into several proposal slices.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolOk } from '@mcp-vertex/core/public';

import { loadOrIngestScaffold } from './ingest-issue.tool';
import type { IGithubClient } from './list-issues.tool';

export interface IAnalyzeIssueToolOptions {
	readonly namespacePrefix: string;
	readonly githubClient: IGithubClient;
	readonly scaffoldDirAbs: string;
}

export interface IAnalyzeIssueArgs {
	readonly number: number;
}

export type IIssueDraftKind =
	| 'fix'
	| 'feat'
	| 'refactor'
	| 'chore'
	| 'spike'
	| 'dismiss';

export interface IIssueDraftSlice {
	readonly title: string;
	readonly files: readonly string[];
}

export interface IIssueDraft {
	readonly kind: IIssueDraftKind;
	readonly confidence: number;
	readonly rationale: string;
	readonly bodyMarkdown: string;
	readonly suggestedSlices?: readonly IIssueDraftSlice[];
}

const LABEL_KIND_RULES: ReadonlyArray<{
	readonly pattern: RegExp;
	readonly kind: IIssueDraftKind;
}> = [
	{ pattern: /bug|fix/i, kind: 'fix' },
	{ pattern: /feature|feat|enhancement/i, kind: 'feat' },
	{ pattern: /refactor/i, kind: 'refactor' },
	{ pattern: /chore/i, kind: 'chore' },
	{ pattern: /spike|research|question/i, kind: 'spike' },
];

const REPRO_PATTERN = /repro steps|steps to reproduce/i;
const FEATURE_REQUEST_PATTERN = /would be nice if|feature request/i;
/** Matches plausible repo-relative path segments, e.g. `plugins/issues`, `apps/web/src`. */
const PATH_SEGMENT_PATTERN = /\b([a-z0-9._-]+\/[a-z0-9._/-]+)\b/gi;

const kindFromLabels = (labels: readonly string[]): IIssueDraftKind | null => {
	for (const label of labels) {
		for (const rule of LABEL_KIND_RULES) {
			if (rule.pattern.test(label)) return rule.kind;
		}
	}
	return null;
};

/** Body length → confidence ceiling: short bodies can never earn high confidence. */
const confidenceCeiling = (body: string): number => {
	const length = body.trim().length;
	if (length < 80) return 0.3;
	if (length < 300) return 0.55;
	if (length < 800) return 0.75;
	return 0.9;
};

/**
 * Extracts the `> Labels: a, b, c` line `buildScaffold` (S2) always
 * embeds near the top of the body, e.g. `'> Labels: bug, p1'` or
 * `'> Labels: (none)'`. Returns `[]` when the line is absent/`(none)`
 * — analysis still proceeds on body-text signal alone.
 */
const extractLabelsFromBody = (body: string): readonly string[] => {
	const match = body.match(/^>\s*Labels:\s*(.*)$/m);
	if (!match) return [];
	const raw = (match[1] ?? '').trim();
	if (raw === '' || raw === '(none)') return [];
	return raw
		.split(',')
		.map((label) => label.trim())
		.filter(Boolean);
};

/** Counts distinct repo-path-like segments mentioned in the body (multi-domain heuristic). */
const distinctPathSegments = (body: string): Set<string> => {
	const matches = body.matchAll(PATH_SEGMENT_PATTERN);
	const roots = new Set<string>();
	for (const m of matches) {
		const raw = m[1];
		if (!raw) continue;
		const root = raw.split('/')[0];
		if (root) roots.add(root.toLowerCase());
	}
	return roots;
};

const buildDraft = (
	labels: readonly string[],
	title: string,
	body: string,
): IIssueDraft => {
	const ceiling = confidenceCeiling(body);
	const labelKind = kindFromLabels(labels);
	const reasons: string[] = [];

	let kind: IIssueDraftKind;
	let confidence: number;

	if (REPRO_PATTERN.test(body)) {
		kind = 'fix';
		confidence = ceiling;
		reasons.push('body contains explicit repro steps');
	} else if (FEATURE_REQUEST_PATTERN.test(body)) {
		kind = 'feat';
		confidence = ceiling;
		reasons.push('body reads as a feature request');
	} else if (labelKind !== null) {
		kind = labelKind;
		confidence = ceiling * 0.85;
		reasons.push(`labels suggest "${labelKind}"`);
	} else {
		kind = 'dismiss';
		confidence = Math.min(ceiling, 0.25);
		reasons.push('no label or body signal strong enough to classify');
	}

	const pathRoots = distinctPathSegments(body);
	const suggestedSlices: IIssueDraftSlice[] | undefined =
		pathRoots.size >= 3
			? [...pathRoots].map((root) => ({
					title: `${title} — ${root}`,
					files: [root],
				}))
			: undefined;

	if (suggestedSlices) {
		reasons.push(
			`body mentions ${pathRoots.size} distinct areas (${[...pathRoots].join(', ')}); consider splitting into slices`,
		);
	}

	return {
		kind,
		confidence: Math.round(confidence * 100) / 100,
		rationale: reasons.join('; '),
		bodyMarkdown: body,
		...(suggestedSlices ? { suggestedSlices } : {}),
	};
};

const SUGGESTED_SLICE_SCHEMA = z.object({
	title: z.string(),
	files: z.array(z.string()),
});

const DRAFT_SCHEMA = z.object({
	kind: z.enum(['fix', 'feat', 'refactor', 'chore', 'spike', 'dismiss']),
	confidence: z.number(),
	rationale: z.string(),
	bodyMarkdown: z.string(),
	suggestedSlices: z.array(SUGGESTED_SLICE_SCHEMA).optional(),
});

const ANALYZE_ISSUE_OUTPUT_SCHEMA = z.object({
	ok: z.boolean(),
	error: z
		.object({ reason: z.string(), nextAction: z.string().optional() })
		.optional(),
	draft: DRAFT_SCHEMA.optional(),
	sourceFile: z.string().optional(),
});

export const runAnalyzeIssue = async (
	args: IAnalyzeIssueArgs,
	options: IAnalyzeIssueToolOptions,
) => {
	try {
		const { filePath, scaffold } = await loadOrIngestScaffold(
			options.scaffoldDirAbs,
			options.githubClient,
			args.number,
		);
		const titleLine = scaffold.body.split('\n')[0] ?? '';
		const title = titleLine.replace(/^#\s*/, '').trim();
		const labels = extractLabelsFromBody(scaffold.body);
		const draft = buildDraft(labels, title, scaffold.body);
		return toolOk({ draft, sourceFile: filePath });
	} catch (error) {
		return toolError(
			error instanceof Error ? error.message : String(error),
			'Check the issue number / repo configuration / gh auth status.',
		);
	}
};

/** Registration for `<prefix>_issues_analyze`. */
export const buildAnalyzeIssueRegistration = (
	options: IAnalyzeIssueToolOptions,
): IToolRegistration => ({
	id: 'issues_analyze',
	effects: ['write'],
	tags: ['issues'],
	summary:
		'Mechanical pre-analysis of a GitHub issue (kind/confidence/rationale draft). Never creates a proposal.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_issues_analyze`,
			{
				outputSchema: ANALYZE_ISSUE_OUTPUT_SCHEMA,
				description:
					'REQUIRES proposals plugin. Runs a mechanical pre-analysis (label/body heuristics) over a GitHub issue and returns a draft kind/confidence/rationale. Auto-ingests if not already ingested. Does not create a proposal.',
				inputSchema: z.object({
					number: z.number(),
				}),
			},
			async (args: IAnalyzeIssueArgs) => runAnalyzeIssue(args, options),
		);
	},
});
