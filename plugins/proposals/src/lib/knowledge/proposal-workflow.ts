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
		readonly description: string;
		readonly cascadePriority: number;
	}>;
	readonly locations: Readonly<Record<string, string>>;
	readonly naming: string;
	readonly rules: readonly string[];
	readonly template: string;
}

export const buildProposalWorkflow = (
	proposalsDir: string,
	indexFile: string,
): IProposalWorkflow => ({
	families: [
		{
			prefix: 'f',
			description: 'fixes (highest cascade priority)',
			cascadePriority: 0,
		},
		{
			prefix: 'p',
			description: 'proposals (planned work)',
			cascadePriority: 1,
		},
	],
	locations: {
		proposalsDir,
		indexFile,
		historical: `${proposalsDir}/historical`,
		fixes: `${proposalsDir}/fixes`,
	},
	naming: '<family><n>-<kebab-title>.md, e.g. p12-add-login.md, f3-fix-crash.md',
	rules: [
		'One proposal = one markdown file with YAML frontmatter (id, status, budget).',
		'Fixes (f) cascade before proposals (p).',
		'Claim files with agent_lock before editing; release when the slice closes.',
		'A proposal may declare a `## Slices` section to parallelise disjoint work.',
		'Layout under <docsDir>/proposals (default docs/mcp-vertex/proposals): index.json (registry), README.md (guide), p<N>-*.md / f<N>-*.md (proposals/fixes), done/ (archived), optional host buckets via extraFolders.',
		'Adopting a project that already has a proposals folder? Call proposal_adopt — it returns the canonical layout, scans the folder and gives a plan to organize it; then you run the steps.',
		'2+ agents sharing this repo? Each should call agent_worktree (action: create) once at the start of its session — it isolates the agent into its own git worktree + branch (agent/<name>) so concurrent git add/commit never race on a shared .git/index. List active worktrees with action: list; clean up with action: remove.',
		'Run sync_proposals after creating or renaming files under the proposals dir.',
		'Mark a slice done by flipping `- status: done`; archive completed proposals to historical/.',
		'Peer review: instead of closing your own slice, proposal_review action=submit (it stays NOT done). A DIFFERENT agent reviews: action=approve → done + lock released, or action=request_changes (with a note) → reworkable. The fixer re-submits and another agent reviews the fix. Loop until a reviewer has no objection. Reviewer must differ from the implementer.',
	],
	template: [
		'---',
		'id: p<n>',
		'status: todo',
		'budget: 1',
		'---',
		'',
		'# p<n> — <title>',
		'',
		'## Goal',
		'',
		'## Acceptance',
		'- [ ] ...',
		'',
		'## Slices (optional, for parallel work)',
		'- id: s1',
		'  files: [path/a.ts]',
		'  status: todo',
	].join('\n'),
});
