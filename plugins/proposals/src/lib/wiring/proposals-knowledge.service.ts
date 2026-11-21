import type { IKnowledgeEntry } from '@delendai/core/public';
import type { IProposalsKnowledgeInput } from '../contracts/interfaces/proposals-wiring.interface';

/** The orientation knowledge entries the proposals plugin contributes. */
export const buildProposalsKnowledge = ({
	ctx,
	layout,
	hasProposalsStore,
}: IProposalsKnowledgeInput): readonly IKnowledgeEntry[] => [
	// when the workspace has NO proposals store yet,
	// orientation names the one call that bootstraps it.
	...(hasProposalsStore
		? []
		: [
				{
					id: 'proposals-store-missing',
					title: 'Proposals store not bootstrapped yet',
					body: [
						'# Proposals store missing',
						'',
						`This workspace has no proposals store at \`${layout.proposalsDir}\`.`,
						'Bootstrap it in one call:',
						'',
						'- `proposal_adopt { apply: true }` — creates the status folders,',
						'  a README and the registry index (idempotent, atomic).',
						'- Add `migrate: { roots: ["docs/rfcs", "TODO.md"] }` to convert an',
						'  existing foreign scheme (rfc docs, TODO checklists, ad-hoc',
						'  frontmatter) into canonical proposals with provenance.',
					].join('\n'),
				},
			]),
	{
		id: 'multi-agent-loop',
		title: 'Multi-agent slice loop',
		body: [
			'# Multi-agent slice loop',
			'',
			'Several agents work a proposal in parallel without stepping on each other:',
			'1. create_proposal with file-disjoint ## Slices (validated on create).',
			'2. Orchestrator: proposal_board to see slices + claimable; plan to re-check disjointness.',
			'3. delegate one claimable slice per subagent (assigns a name + claims its files).',
			'4. Each subagent edits ONLY its files, validates, then close_slice (done + release lock).',
			'5. When all slices are done, run the global gate once; archive the proposal.',
			'Disjointness is the contract; report lock-conflict instead of retrying.',
		].join('\n'),
	},
	{
		id: 'proposals-workflow',
		title: 'Proposals workflow',
		body: [
			'# Proposals workflow',
			'',
			`Tools are namespaced \`${ctx.namespacePrefix}_*\`. Start with \`auto_work\`.`,
			'',
			'- `auto_work` — one call: the next proposal + an ordered action plan.',
			'- `auto_work.orchestration` — context policy: keep the main thread compact; inspect plan/delegate for non-trivial slices.',
			'- `continue_proposal` — next proposal (mode "auto"), or a parallel slice plan/claim (modes "plan"/"claim").',
			'- `agent_lock` — claim files before editing, heartbeat while working, release after (claim/heartbeat/release/status/gc).',
			'- `get_proposal_workflow` — families, locations, naming, template.',
			'- `create_proposal` — author a new proposal; it allocates the id. Where the project works in units, enter one first with `work enter --kind=create --proposal=new` and pass its worktree as `checkout`; the unit adopts the id. Never write a proposal file or pick an id by hand; if the tool is hidden, activate the plugin.',
			'- `sync_proposals` — rebuild the index after creating/renaming proposal files.',
			'- `agent_names` — name the whole agent tree, orchestrator included.',
			'- `task_queue` / `round_context` — multi-agent coordination & resumed rounds.',
			'',
			'Loop: claim → one atomic slice → validate → close_slice. If that was the last open slice, sync once; otherwise do not sync mid-flight. On blocked claims, await_lock or lock-released — never poll.',
			`State under \`${layout.scratchDir}\`; proposals under \`${layout.proposalsDir}\`.`,
		].join('\n'),
	},
];
