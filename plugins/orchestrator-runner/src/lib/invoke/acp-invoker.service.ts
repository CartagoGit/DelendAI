/**
 * acp-invoker.service.ts — the `acp` provider kind: a hop runs on any
 * agent that speaks the Agent Client Protocol.
 *
 * The roster entry names an agent (from the ACP registry or a
 * declaration, started the way `delendai agents list` says it can start
 * here) or the command that starts one. The hop's prompt is one ACP turn;
 * its text and usage come back as the result; a cancel or a timeout stops
 * the agent. A permission the agent asks for is granted only when the
 * tool it names is in the hop's `toolsAllow`; every other one is refused
 * and listed in the result, so nothing runs on the agent's say-so alone.
 */
import { listAgents, runAcpAgent } from '@delendai/core/cli';
import type { IAcpLaunch, IAcpPermissionAsk } from '@delendai/core/contracts';

import type { IAcpInvokerOptions } from '../contracts/interfaces/acp-invoker.interface';
import type {
	IActiveInvocation,
	IInvokeRequest,
	IInvokeResult,
	IKindInvoker,
} from './types';

/** Whether `ask` names one of the allowed tools, as a whole word. */
export const permittedBy = (
	ask: IAcpPermissionAsk,
	toolsAllow: readonly string[] | undefined,
): boolean =>
	(toolsAllow ?? []).some((tool) =>
		new RegExp(
			`\\b${tool.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`,
			'iu',
		).test(ask.title),
	);

export const createAcpInvoker = (options: IAcpInvokerOptions): IKindInvoker => {
	const run = options.run ?? runAcpAgent;
	const list = options.listAgents ?? listAgents;
	// The agents are found once per runner, not on every hop.
	let known: Promise<ReadonlyMap<string, IAcpLaunch | undefined>> | undefined;
	const launchOf = async (agent: string): Promise<IAcpLaunch | undefined> => {
		known ??= list({ workspace: options.cwd, all: true }).then(
			({ agents }) =>
				new Map(agents.map((each) => [each.id, each.launch])),
		);
		return (await known).get(agent);
	};
	return {
		start(request: IInvokeRequest): IActiveInvocation {
			const invoke = request.invoke;
			if (invoke.kind !== 'acp')
				return {
					promise: Promise.reject(
						new Error(`acp invoker got a ${invoke.kind} decision`),
					),
					cancel: () => undefined,
				};
			const controller = new AbortController();
			const refused: string[] = [];
			const promise = (async (): Promise<IInvokeResult> => {
				const launch =
					invoke.command !== undefined
						? {
								command: invoke.command,
								args: [...(invoke.args ?? [])],
							}
						: invoke.agent === undefined
							? undefined
							: await launchOf(invoke.agent);
				if (launch === undefined)
					throw new Error(
						`${invoke.agent ?? 'the agent'} cannot start here over ACP: install it (delendai agents install) or declare its command`,
					);
				const turn = await run(launch, {
					cwd: options.cwd,
					prompt: request.prompt,
					signal: controller.signal,
					decide: async (ask) => {
						const allow = ask.options.find(
							(option) => option.kind === 'allow_once',
						);
						if (
							allow !== undefined &&
							permittedBy(ask, request.toolsAllow)
						)
							return { optionId: allow.id };
						refused.push(ask.title);
						const reject =
							ask.options.find(
								(option) => option.kind === 'reject_once',
							) ??
							ask.options.find(
								(option) => option.kind === 'reject_always',
							);
						return reject === undefined
							? 'cancel'
							: { optionId: reject.id };
					},
				});
				return {
					text: turn.text,
					...(turn.usage === undefined ? {} : { usage: turn.usage }),
					structuredContent: {
						agent: turn.agent,
						stopReason: turn.stopReason,
						refusedPermissions: refused,
					},
				};
			})();
			return { promise, cancel: () => controller.abort() };
		},
	};
};
