import {
	buildKindOrder,
	DEFAULT_KIND_ORDER,
	LEGACY_ALIAS_PREFIX,
} from '../cascade/cascade-priority';
import {
	PROPOSAL_KIND_BY_PREFIX,
	PROPOSAL_KINDS,
} from '../contracts/constants/proposal-glossary.constant';
import type { IProposalKind } from '../contracts/constants/proposal-glossary.constant';

/**
 * Generalized, compact description of the proposal workflow this
 * plugin supports. Returned by the `get_proposal_workflow` tool as
 * structured JSON so any agent can self-orient without loading prose.
 * Project-agnostic: families and locations are conventions, not a
 * specific host's policy.
 */
export interface IProposalWorkflow {
	readonly families: ReadonlyArray<{
		readonly prefix: string;
		readonly kind: IProposalKind | typeof LEGACY_ALIAS_PREFIX;
		readonly description: string;
		readonly cascadePriority: number;
	}>;
	readonly locations: Readonly<Record<string, string>>;
	readonly naming: string;
	readonly rules: readonly string[];
	readonly template: string;
}

/**
 * Builds the 13 cascade families (12 active kinds + the retired `p`
 * legacy alias) from the glossary's `PROPOSAL_KINDS` and the cascade
 * module's default order (f00024). Each description is derived from the
 * kind itself (`"{kind} ({prefix}: prefix)"`), so it never lies about
 * what a prefix actually means — the old hardcoded `f`/`p` pair
 * described `f` as "fixes" when `f` has meant `feat` since f00016.
 */
const buildProposalFamilies = (): IProposalWorkflow['families'] => {
	const order = buildKindOrder(DEFAULT_KIND_ORDER);
	const kindFamilies = DEFAULT_KIND_ORDER.map((kind) => ({
		prefix: PROPOSAL_KINDS[kind].prefix,
		kind,
		description: `${kind} (${PROPOSAL_KINDS[kind].prefix}: prefix)`,
		cascadePriority: order.get(kind) as number,
	}));
	return [
		...kindFamilies,
		{
			prefix: LEGACY_ALIAS_PREFIX,
			kind: LEGACY_ALIAS_PREFIX,
			description: `legacy alias for ${PROPOSAL_KIND_BY_PREFIX[LEGACY_ALIAS_PREFIX]} (pre-f00016) — kept for back-compat`,
			cascadePriority: order.get(LEGACY_ALIAS_PREFIX) as number,
		},
	];
};

export const buildProposalWorkflow = (
	proposalsDir: string,
	indexFile: string,
): IProposalWorkflow => ({
	families: buildProposalFamilies(),
	locations: {
		proposalsDir,
		indexFile,
		historical: `${proposalsDir}/historical`,
		fixes: `${proposalsDir}/fixes`,
	},
	naming: '<family><zero-padded-n>-<kebab-title>.md, e.g. f00109-dead-config-diagnostics.md, x00098-align-formats.md (ids come from create_proposal — never hand-pick a number)',
	rules: [
		'NEVER hand-write a proposal file: create_proposal owns id allocation, frontmatter, the canonical body and the index sync.',
		'One proposal = one markdown file with YAML frontmatter (id, title, kind, status, type, track, date).',
		'Statuses are hyphenated (ready, in-progress, review, done, paused, blocked, retired) and each proposal lives in its status folder (<proposalsDir>/<status>/...); proposal_transition moves the file when the status changes.',
		'Cascade order (highest priority first): fix, breaking, audit, chore, feat, refactor, perf, docs, test, infra, spike, legacy, p (legacy alias). A proposal may override its priority via `cascadeOverride` (+ mandatory `cascadeOverrideReason`) or nudge it within its own kind via `cascadeBoost`.',
		'Claim files with agent_lock before editing; send agent_lock heartbeat while working; release when the slice closes.',
		'A proposal may declare a `## Slices` section to parallelise disjoint work; each slice lists its files (`- **Files**: `a`, `b``), a gate and a status.',
		'Adopting a project that already has a proposals folder? Call proposal_adopt — it returns the canonical layout, scans the folder and gives a plan to organize it; then you run the steps.',
		'2+ agents sharing this repo? Each must call agent_worktree (action: create) once at the start of its session — it isolates the agent into its own git worktree + branch (agent/<name>) so concurrent git add/commit never race on a shared .git/index. List active worktrees with action: list; clean up with action: remove.',
		'If the work needs more than 3 tool calls, touches multiple files, or requires repeated MCP reads, delegate it instead of keeping it on the main thread.',
		'Run sync_proposals only after the last open slice of that proposal is closed; do not sync mid-flight while peer slices are still open.',
		'Finish a slice with proposal_review action=submit (it stays NOT done). close_slice may flip `- **Status**: done` only when requirePeerReview is false or the slice already has review-state: done; move finished proposals with proposal_transition, never by hand.',
		'Peer review: instead of closing your own slice, proposal_review action=submit (it stays NOT done). A DIFFERENT agent reviews: action=approve → done + lock released, or action=request_changes (with a note) → reworkable. The fixer re-submits and another agent reviews the fix. Loop until a reviewer has no objection. Reviewer must differ from the implementer.',
	],
	template: [
		'---',
		'id: <family><zero-padded-n>',
		'title: "<title>"',
		'kind: <fix|feat|refactor|chore|docs|test|...>',
		'status: ready',
		'type: proposal',
		'track: general',
		'date: <YYYY-MM-DD>',
		'---',
		'',
		'# <id> — <title>',
		'',
		'## Goal',
		'',
		'## why',
		'',
		'## non-goals',
		'',
		'- ...',
		'',
		'## Slices',
		'',
		'- global_gate: <lint|type|e2e|none>',
		'',
		'### S1 — <slice title>',
		'- **Status**: pending',
		'- **Files**: `path/a.ts`, `path/b.spec.ts`',
		'- **Gate**: <lint|type|e2e|none>',
		'',
		'## acceptance',
		'',
		'- ...',
	].join('\n'),
});
