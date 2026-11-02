/**
 * subscription.ts — the `subscription` invoker: a task routed to a
 * subscription runs on the host it belongs to.
 *
 * It used to be a passthrough whatever the subscription was, so a task
 * routed to Codex from Claude Code was handled by Claude Code's own
 * model. Now: the host this server is in handles its own subscription in
 * context (no extra spend); any other host's CLI is started through the
 * cli invoker; a host with no CLI is refused with the reason.
 */
import { SUBSCRIPTION_HOSTS } from '../contracts/constants/subscription-hosts.constant';
import type { ISubscriptionInvokerOptions } from '../contracts/interfaces/subscription-host.interface';
import type {
	IActiveInvocation,
	IInvokeRequest,
	IInvokeResult,
	IKindInvoker,
} from '../invoke/types';

const refused = (message: string): IActiveInvocation => ({
	promise: Promise.reject(new Error(message)),
	cancel: () => undefined,
});

export const createSubscriptionInvoker = (
	options: ISubscriptionInvokerOptions = {},
): IKindInvoker => ({
	start(request: IInvokeRequest): IActiveInvocation {
		if (request.invoke.kind !== 'subscription')
			return refused(
				`subscription invoker got a ${request.invoke.kind} decision`,
			);
		const tool = request.invoke.tool;
		const host = SUBSCRIPTION_HOSTS[tool];
		const current = options.currentHost?.();
		if (
			host === undefined ||
			(current !== undefined && host.current.test(current))
		) {
			const result: IInvokeResult = {
				text: `Passthrough: handle this ${request.decision.mode} task with your current subscription model in-context — no external provider was invoked (zero extra spend).`,
			};
			return {
				promise: Promise.resolve(result),
				cancel: () => undefined,
			};
		}
		if (host.cli === undefined)
			return refused(
				`subscription ${tool} has no CLI to start from here, and this server is not running in it: route the task to it from inside ${tool}, or to a provider this host can reach`,
			);
		if (options.cli === undefined)
			return refused(
				`subscription ${tool} needs a cli invoker to start ${host.cli.command}`,
			);
		return options.cli.start({
			...request,
			invoke: {
				kind: 'cli',
				command: host.cli.command,
				args: [...host.cli.args],
			},
		});
	},
});
