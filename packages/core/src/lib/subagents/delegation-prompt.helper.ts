/**
 * delegation-prompt.helper.ts — the prompt a host that cannot enforce a
 * manifest gets instead: rendered from the manifest alone, so nothing of
 * the parent conversation goes with the task.
 *
 * A host whose subagents are started through its own tool (a `Task`-like
 * call) takes a prompt, not a manifest. Handed the orchestrator's
 * instruction, the subagent rebuilt the project or inherited the session;
 * handed this, it knows its objective, what it may open, what it may use
 * and what to return, in a few hundred tokens.
 */
import type { IDelegatedTask } from '@delendai/contracts';

/** The bounded prompt for `task`, with the tool that expands a reference. */
export const renderDelegationPrompt = (task: IDelegatedTask): string => {
	const lines = [
		`Objective: ${task.objective}`,
		`Context: manifest ${task.manifestId} (project contract ${task.contractHash}). Open only the references you need${
			task.moreContext.allowed && task.moreContext.via !== undefined
				? `, through ${task.moreContext.via}`
				: ''
		}; do not rebuild the project's context.`,
		task.allowedTools.length > 0
			? `Tools you may use: ${task.allowedTools.join(', ')}. No others.`
			: 'Use no tool beyond reading what the manifest references.',
		`Budget: at most ${String(task.inputBudget)} input tokens.`,
	];
	if (task.missingContext !== undefined && task.missingContext.length > 0) {
		lines.push(
			`Not available: ${task.missingContext.map((missing) => `${missing.id} (${missing.reason})`).join('; ')}. Do not look for it; say if the task cannot be done without it.`,
		);
	}
	if (task.acceptance.length > 0) {
		lines.push(
			`Done when: ${task.acceptance.map((check, index) => `(${String(index + 1)}) ${check}`).join(' ')}`,
		);
	}
	lines.push(
		task.outputSchema === undefined
			? 'Return a short receipt: status, files changed, checks run and their result, and only what needs a decision.'
			: `Return a receipt matching this JSON Schema: ${JSON.stringify(task.outputSchema)}`,
	);
	return lines.join('\n');
};
