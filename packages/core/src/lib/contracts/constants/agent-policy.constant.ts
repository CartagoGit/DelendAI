import type { IDelendaiAgentPolicyConfig } from '../interfaces/agent-policy.interface';

export const DEFAULT_AGENT_POLICY: Required<IDelendaiAgentPolicyConfig> = {
	// Agents ask unless the project says they may decide: the human stays
	// in the loop by default, and a project opts in to autonomy.
	autonomous: false,
	principles: [
		'Apply SOLID architecture where it improves ownership and changeability.',
		'Use good engineering practices and keep the code clear and maintainable.',
		'Reuse existing code and abstractions before introducing duplication.',
		'Keep naming, files, and folders homogeneous with the surrounding project.',
	],
};
