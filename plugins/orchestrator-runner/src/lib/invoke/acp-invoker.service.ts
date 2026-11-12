/**
 * acp-invoker.service.ts — the `acp` provider kind: a hop runs on any
 * agent that speaks the Agent Client Protocol.
 *
 * The roster entry names an agent (from the ACP registry or a
 * declaration, started the way `delendai agents list` says it can start
 * here) or the command that starts one. The hop's prompt is one ACP turn;
 * its text and usage come back as the result; a cancel or a timeout stops
 * the agent. A permission the agent asks for is granted only when its
 * structured tool kind is one the hop's `toolsAllow` stands for; its
 * free-text title is never evidence. Every other request is refused and
 * listed in the result with why, so nothing runs on the agent's say-so.
 */
import { listAgents, runAcpAgent } from '@delendai/core/cli';
import type { IAcpLaunch, IAcpPermissionAsk } from '@delendai/core/contracts';

import { ACP_KIND_OF_TOOL } from '../contracts/constants/acp-permission.constant';
import type { IAcpInvokerOptions } from '../contracts/interfaces/acp-invoker.interface';
import type {
	IActiveInvocation,
	IInvokeRequest,
	IInvokeResult,
	IKindInvoker,
} from './types';

/**
 * Whether `ask` is allowed, and why not when it is not. Only the
 * structured identity of the operation (its protocol tool kind) is
 * evidence: the title is the agent's own words, and an agent that titles
 * a shell command "Read" must not be granted it. No kind, no grant.
 */
export const permissionVerdict = (
	ask: IAcpPermissionAsk,
	toolsAllow: readonly string[] | undefined,
): { readonly granted: boolean; readonly why: string } => {
	const kind = ask.kind?.toLowerCase();
	if (kind === undefined || kind.length === 0) {
		return {
			granted: false,
			why: 'the request names no tool kind, and its title is not evidence',
		};
	}
	const allowed = new Set(
		(toolsAllow ?? []).flatMap((tool) => {
			const of = ACP_KIND_OF_TOOL[tool.toLowerCase()];
			return of === undefined ? [] : [of];
		}),
	);
	return allowed.has(kind)
		? { granted: true, why: `tool kind ${kind} is allowed` }
		: {
				granted: false,
				why: `tool kind ${kind} is not in the allowed tools (${(toolsAllow ?? []).join(', ') || 'none'})`,
			};
};

/** Whether `ask` is allowed by its structured tool kind. */
export const permittedBy = (
	ask: IAcpPermissionAsk,
	toolsAllow: readonly string[] | undefined,
): boolean => permissionVerdict(ask, toolsAllow).granted;

export const createAcpInvoker = (options: IAcpInvokerOptions): IKindInvoker => {
	const run = options.run ?? runAcpAgent;
	const list = options.listAgents ?? listAgents;
	// The agents are found once per runner, not on every hop.
	let known:
		| Promise<
				ReadonlyMap<
					string,
					{ readonly launch?: IAcpLaunch; readonly refusal?: string }
				>
		  >
		| undefined;
	const agentOf = async (agent: string) => {
		known ??= list({ workspace: options.cwd, all: true }).then(
			({ agents }) =>
				new Map(
					agents.map((each) => [
						each.id,
						{
							...(each.launch === undefined
								? {}
								: { launch: each.launch }),
							...(each.refusal === undefined
								? {}
								: { refusal: each.refusal }),
						},
					]),
				),
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
				const found =
					invoke.command !== undefined || invoke.agent === undefined
						? undefined
						: await agentOf(invoke.agent);
				const launch: IAcpLaunch | undefined =
					invoke.command !== undefined
						? {
								command: invoke.command,
								args: [...(invoke.args ?? [])],
							}
						: found?.launch;
				if (launch === undefined)
					throw new Error(
						found?.refusal ??
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
						const verdict = permissionVerdict(
							ask,
							request.toolsAllow,
						);
						if (allow !== undefined && verdict.granted)
							return { optionId: allow.id };
						refused.push(
							`${ask.title} (${verdict.granted ? 'no allow-once option offered' : verdict.why})`,
						);
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
						// Said when the agent was fetched from the network.
						...(launch.fromNetwork === undefined
							? {}
							: { fetchedFromNetwork: launch.fromNetwork }),
					},
				};
			})();
			return { promise, cancel: () => controller.abort() };
		},
	};
};
