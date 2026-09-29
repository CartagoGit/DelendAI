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
 */
import { DEFAULT_AGENT_POLICY } from '../contracts/constants/agent-policy.constant';
import type { IDelendaiAgentPolicyConfig } from '../contracts/interfaces/agent-policy.interface';

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

/** The server instructions an MCP client receives when it connects. */
export const agentPolicyInstructions = (
	policy: IDelendaiAgentPolicyConfig | undefined,
): string => agentPolicyLines(policy).join('\n');
