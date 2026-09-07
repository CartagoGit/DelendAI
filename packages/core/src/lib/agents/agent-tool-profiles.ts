import type { IAgentSlot } from '../contracts/interfaces/agent-slot.interface';

export type IAgentHostTool =
	| 'read'
	| 'search'
	| 'edit'
	| 'execute'
	| 'todo'
	| 'agent';

export interface IAgentToolProfile {
	readonly directWork: boolean;
	readonly canDelegate: boolean;
	readonly tools: readonly IAgentHostTool[];
	readonly purpose: string;
}

const COMMON_TOOLS = ['read', 'search', 'execute', 'todo'] as const;

export const AGENT_TOOL_PROFILES: Readonly<
	Record<IAgentSlot, IAgentToolProfile>
> = {
	orchestrator: {
		directWork: true,
		canDelegate: true,
		tools: [...COMMON_TOOLS, 'edit', 'agent'],
		purpose:
			'Coordinates work, can complete small tasks directly, and delegates only when useful.',
	},
	proposal_guardian: {
		directWork: true,
		canDelegate: false,
		tools: [...COMMON_TOOLS, 'edit'],
		purpose:
			'Maintains proposal structure, ownership, review state, and workflow hygiene.',
	},
	implementation_runner: {
		directWork: true,
		canDelegate: false,
		tools: [...COMMON_TOOLS, 'edit'],
		purpose: 'Implements one claimed slice and runs its focused validation.',
	},
	delivery_verifier: {
		directWork: false,
		canDelegate: false,
		tools: COMMON_TOOLS,
		purpose:
			'Verifies acceptance evidence and tests without mutating the implementation.',
	},
	technical_investigator: {
		directWork: false,
		canDelegate: false,
		tools: COMMON_TOOLS,
		purpose:
			'Investigates code paths and reports findings without editing files.',
	},
};

export const agentToolProfile = (
	slot: IAgentSlot,
): IAgentToolProfile => AGENT_TOOL_PROFILES[slot];