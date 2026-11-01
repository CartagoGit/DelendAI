/**
 * tool-call-hold.helper.ts — a tool call waits for the start to settle.
 *
 * A host answers `initialize` before it reconciles the workspace, so a client
 * can call a tool while the checkout is still being brought level. Refusing
 * that call would turn a slow start into a failure; running it would let it
 * act on a state the start is about to change. It waits.
 */
let hold: Promise<void> | undefined;

/** Hold every tool call; the function returned lets them through. */
export const holdToolCalls = (): (() => void) => {
	let release = (): void => undefined;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	hold = held;
	return () => {
		if (hold === held) hold = undefined;
		release();
	};
};

/** Resolves once no start holds tool calls. */
export const toolCallsReleased = async (): Promise<void> => hold;
