import type {
	IScaffoldAgentSlot,
	IScaffoldHostOptions,
	IScaffoldedFile,
} from '../scaffold/scaffold-host';
import type { IAdoptionFileContribution } from '../contracts/interfaces/adoption-extension.interface';
import {
	scaffoldAgentFile,
	scaffoldClaudeAgentFile,
	scaffoldCodexAgentFile,
	scaffoldInstructionsFile,
} from '../scaffold/scaffold-host';

const SUBAGENT_SLOTS: readonly IScaffoldAgentSlot[] = [
	'proposal_guardian',
	'implementation_runner',
	'delivery_verifier',
	'technical_investigator',
];

export interface IAdoptProjectWriteEstimateBreakdownEntry {
	readonly kind: 'config' | 'generated' | 'plugin';
	readonly description: string;
	readonly count?: number;
	readonly exact: boolean;
}

export interface IAdoptProjectWriteEstimate {
	readonly count: number;
	readonly exact: boolean;
	readonly breakdown: readonly IAdoptProjectWriteEstimateBreakdownEntry[];
}

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

/**
 * What `adopt_project` would write: the config, the generated host files,
 * and what each loaded plugin's adoption extension adds. `contributions`
 * is `undefined` when plugins contribute but their files could not be
 * counted (no docsDir), which makes the estimate inexact rather than
 * silently smaller.
 */
export const buildAdoptProjectWriteEstimate = (input: {
	hostOptions: IScaffoldHostOptions;
	contributions: readonly IAdoptionFileContribution[] | undefined;
}): IAdoptProjectWriteEstimate => {
	const breakdown: IAdoptProjectWriteEstimateBreakdownEntry[] = [
		{
			kind: 'config',
			description: 'Project config file (delendai.config.json).',
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
		...(input.contributions === undefined
			? [
					{
						kind: 'plugin' as const,
						description:
							'Files loaded plugins add depend on docsDir; omitted when the assessment lacks that path.',
						exact: false,
					},
				]
			: input.contributions.map((contribution) => ({
					kind: 'plugin' as const,
					description: `${contribution.title}: files the plugin adds.`,
					count: contribution.count,
					exact: true,
				}))),
	];
	return {
		count: breakdown.reduce(
			(total, entry) => total + (entry.count ?? 0),
			0,
		),
		exact: breakdown.every((entry) => entry.exact),
		breakdown,
	};
};
