/**
 * task-pack-budget.service.ts — the input a hop may take, from the model
 * that will read it.
 *
 * One budget for every model let a 32k-context model be handed what only a
 * 1M-context one can read. The budget is a share of the target's context
 * window, never above the delegated task's own; a model whose window is
 * unknown keeps the task's budget. Over it, a hop does not start.
 */
import type { IHopBudget } from '../contracts/interfaces/task-pack.interface';
import {
	HOP_BYTES_PER_TOKEN,
	HOP_CONTEXT_WINDOW_SHARE,
} from '../contracts/constants/task-pack.constant';

/** The budget of a hop to a model with `contextWindow`, under `taskBudget`. */
export const hopInputBudget = (input: {
	readonly contextWindow?: number | undefined;
	readonly taskBudget?: number | undefined;
}): IHopBudget => {
	const window =
		input.contextWindow !== undefined && input.contextWindow > 0
			? Math.floor(input.contextWindow * HOP_CONTEXT_WINDOW_SHARE)
			: undefined;
	if (
		window !== undefined &&
		(input.taskBudget === undefined || window < input.taskBudget)
	)
		return { tokens: window, rule: 'model-window' };
	return input.taskBudget === undefined
		? { rule: 'none' }
		: { tokens: input.taskBudget, rule: 'task' };
};

/** The tokens `prompt` takes, at the estimate every delendai budget uses. */
export const promptTokens = (prompt: string): number =>
	Math.ceil(Buffer.byteLength(prompt, 'utf8') / HOP_BYTES_PER_TOKEN);

/** Why `prompt` may not go to a hop held to `budget`, or `undefined` when it fits. */
export const overHopBudget = (
	prompt: string,
	budget: IHopBudget,
): string | undefined => {
	if (budget.tokens === undefined) return undefined;
	const tokens = promptTokens(prompt);
	return tokens <= budget.tokens
		? undefined
		: `the task pack takes ${String(tokens)} tokens, over this model's budget of ${String(budget.tokens)} (${budget.rule})`;
};
