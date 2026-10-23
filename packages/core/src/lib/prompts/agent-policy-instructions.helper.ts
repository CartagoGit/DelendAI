/**
 * agent-policy-instructions.helper.ts — what `core.agentPolicy` tells an
 * agent, in one place.
 *
 * `core.agentPolicy.autonomous` decides whether agents stop for the user
 * or decide themselves. It only reached the `agent_bootstrap` prompt,
 * which an agent reads if it asks for it, so the setting changed nothing
 * a host showed its model. The server now states it in the instructions
 * every MCP client receives when it connects, and the prompt says the
 * same words.
 *
 * The same holds for the development policy. The work model was
 * resolved at startup and then told to nobody: an agent learned how
 * this project lands work from whatever document it read, and a
 * document describing another profile sent it down a pull-request flow
 * in a project that merges. The resolved policy is rendered here, by
 * the one renderer every other surface uses, before anything else.
 */
import { DEFAULT_AGENT_POLICY } from '../contracts/constants/agent-policy.constant';
import type { IDelendaiAgentPolicyConfig } from '../contracts/interfaces/agent-policy.interface';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { servedWorkModelLines } from '../development-policy/served-work-model';

/** The working mode and principles an agent works under, as lines. */
export const agentPolicyLines = (
	policy: IDelendaiAgentPolicyConfig | undefined,
): readonly string[] => {
	const autonomous = policy?.autonomous ?? DEFAULT_AGENT_POLICY.autonomous;
	const principles = policy?.principles ?? DEFAULT_AGENT_POLICY.principles;
	return [
		autonomous
			? 'Working mode: autonomous. Decide and carry on; stop for the user only for a decision that is theirs alone, or before an action that is destructive or hard to undo.'
			: 'Working mode: collaborative. Ask the user before an action they did not request, and whenever a decision is theirs; wait for their answer, and never answer a question in their place.',
		'Engineering principles:',
		...principles.map((principle) => `- ${principle}`),
	];
};

/**
 * Everything an agent must obey before it works: the working mode, the
 * principles, and this project's work model when one is resolved.
 */
export const agentOperatingLines = (
	policy: IDelendaiAgentPolicyConfig | undefined,
	developmentPolicy?: IResolvedDevelopmentPolicy | undefined,
): readonly string[] => [
	...agentPolicyLines(policy),
	...(developmentPolicy === undefined
		? []
		: servedWorkModelLines(developmentPolicy)),
];

/** The server instructions an MCP client receives when it connects. */
export const agentPolicyInstructions = (
	policy: IDelendaiAgentPolicyConfig | undefined,
	developmentPolicy?: IResolvedDevelopmentPolicy | undefined,
): string => agentOperatingLines(policy, developmentPolicy).join('\n');
