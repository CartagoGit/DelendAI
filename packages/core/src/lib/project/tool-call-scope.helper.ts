import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * tool-call-scope.helper.ts — whether a tool call was made by an agent or
 * by another tool.
 *
 * The capability router answers a call by invoking the tool it resolves,
 * through the same instrumented handler. Observers that saw both calls
 * recorded one agent call twice: the router's answer, and the tool's own
 * result inside it. Only the outermost call is the agent's.
 */
const scope = new AsyncLocalStorage<true>();

/** Runs `body` as a tool call, telling it whether another tool call made it. */
export const asToolCall = <R>(
	body: (nested: boolean) => Promise<R>,
): Promise<R> => {
	const nested = scope.getStore() === true;
	return scope.run(true, () => body(nested));
};
