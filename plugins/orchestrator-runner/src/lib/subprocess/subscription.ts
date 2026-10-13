/**
 * subscription.ts — the best-effort `subscription` invoker (S6, CRITICAL I8).
 *
 * A `subscription` provider maps to the `passthrough` strategy: the current
 * agent's own model handles the task in-context, so there is NO subprocess
 * and NO extra spend. The runner cannot "execute" it — it returns a hint
 * telling the orchestrator to handle the prompt itself. Cancellation is a
 * best-effort no-op (nothing external is running).
 */
import type {
	IActiveInvocation,
	IInvokeRequest,
	IInvokeResult,
	IKindInvoker,
} from '../invoke/types';

export const createSubscriptionInvoker = (): IKindInvoker => ({
	start(request: IInvokeRequest): IActiveInvocation {
		const result: IInvokeResult = {
			text: `Passthrough: handle this ${request.decision.mode} task with your current subscription model in-context — no external provider was invoked (zero extra spend).`,
		};
		return {
			promise: Promise.resolve(result),
			cancel: () => undefined,
		};
	},
});
