import type {
	IScaffoldAgentSlot,
	IScaffoldHostOptions,
	IScaffoldedFile,
} from '../scaffold/scaffold-host';
import {
	scaffoldAgentFile,
	scaffoldClaudeAgentFile,
	scaffoldCodexAgentFile,
	scaffoldInstructionsFile,
} from '../scaffold/scaffold-host';

const PROPOSAL_STATUS_FOLDERS = [
	'ready',
	'in-progress',
	'review',
	'done',
	'paused',
	'blocked',
	'retired',
] as const;

const PROPOSALS_README = [
	'# Proposals',
	'',
	'This folder is the proposals store managed by the mcp-vertex',
	'`proposals` plugin. Each proposal is one markdown file with',
	'frontmatter (`id`, `kind`, `status`, `type`, `track`) and lives in',
	'the folder matching its status:',
	'',
	'- `ready/` — executable now',
	'- `in-progress/` — someone is on it',
	'- `review/` — done, awaiting review',
	'- `done/` — completed (terminal)',
	'- `paused/`, `blocked/`, `retired/` — parked states',
	'',
	'Create proposals with the `create_proposal` tool (it allocates the',
	'id and validates slices), move them with `proposal_transition`, and',
	'ask `get_proposal_workflow` for the full convention. The registry',
	'index is regenerated at any time via `sync_proposals`.',
	'',
].join('\n');

const SUBAGENT_SLOTS: readonly IScaffoldAgentSlot[] = [
	'proposal_guardian',
	'implementation_runner',
	'delivery_verifier',
	'technical_investigator',
];

export interface IAdoptProjectWriteEstimateBreakdownEntry {
	readonly kind: 'config' | 'proposal-store' | 'generated';
	readonly description: string;
	readonly count?: number;
	readonly exact: boolean;
}

export interface IAdoptProjectWriteEstimate {
	readonly count: number;
	readonly exact: boolean;
	readonly breakdown: readonly IAdoptProjectWriteEstimateBreakdownEntry[];
}

export const buildProposalsStoreFiles = (
	docsDir: string,
): IScaffoldedFile[] => [
	...PROPOSAL_STATUS_FOLDERS.map((folder) => ({
		path: `${docsDir}/proposals/${folder}/.gitkeep`,
		content: '',
	})),
	{ path: `${docsDir}/proposals/README.md`, content: PROPOSALS_README },
];

export const buildAgentFiles = (
	options: IScaffoldHostOptions,
): IScaffoldedFile[] => [
	scaffoldAgentFile(options, 'orchestrator'),
	...SUBAGENT_SLOTS.map((slot) => scaffoldAgentFile(options, slot)),
	scaffoldClaudeAgentFile(options, 'orchestrator'),
	...SUBAGENT_SLOTS.map((slot) => scaffoldClaudeAgentFile(options, slot)),
	scaffoldCodexAgentFile(options, 'orchestrator'),
	...SUBAGENT_SLOTS.map((slot) => scaffoldCodexAgentFile(options, slot)),
	scaffoldInstructionsFile(options),
];

export const buildAdoptProjectWriteEstimate = (input: {
	hostOptions: IScaffoldHostOptions;
	docsDir?: string;
}): IAdoptProjectWriteEstimate => {
	const breakdown: IAdoptProjectWriteEstimateBreakdownEntry[] = [
		{
			kind: 'config',
			description: 'Project config file (mcp-vertex.config.json).',
			count: 1,
			exact: true,
		},
		{
			kind: 'generated',
			description:
				'Generated host files (agents, instructions and host-specific agent definitions).',
			count: buildAgentFiles(input.hostOptions).length,
			exact: true,
		},
	];
	if (input.docsDir !== undefined) {
		breakdown.push({
			kind: 'proposal-store',
			description:
				'Bootstrapped proposals store files (.gitkeep per status + README).',
			count: buildProposalsStoreFiles(input.docsDir).length,
			exact: true,
		});
	} else {
		breakdown.push({
			kind: 'proposal-store',
			description:
				'Proposal-store files depend on docsDir; omitted when the assessment lacks that path.',
			exact: false,
		});
	}
	return {
		count: breakdown.reduce(
			(total, entry) => total + (entry.count ?? 0),
			0,
		),
		exact: breakdown.every((entry) => entry.exact),
		breakdown,
	};
};
