/**
 * acp-session.service.ts — one prompt turn with any agent that speaks the
 * Agent Client Protocol: initialize, authenticate when asked, open a
 * session, prompt, collect what it streams.
 *
 * The agent describes itself (name, version, auth methods, modes) instead
 * of delendai keeping that per agent. A permission request is answered by
 * the caller's `decide`; without one every request is refused, so nothing
 * an agent wants to do runs on delendai's say-so alone.
 */
import {
	client,
	methods,
	PROTOCOL_VERSION,
	type AgentApp,
	type Stream,
} from '@agentclientprotocol/sdk';

import type {
	IAcpIntroduction,
	IAcpPermissionAsk,
	IAcpPermissionDecision,
	IAcpPermissionOption,
	IAcpPromptInput,
	IAcpPromptResult,
} from '../contracts/interfaces/acp.interface';

const REFUSALS: ReadonlySet<IAcpPermissionOption['kind']> = new Set([
	'reject_once',
	'reject_always',
]);

/** Without a decider: the agent's own refusal, else cancel the turn. */
const refuse = async (
	ask: IAcpPermissionAsk,
): Promise<IAcpPermissionDecision> => {
	const refusal =
		ask.options.find((option) => option.kind === 'reject_once') ??
		ask.options.find((option) => REFUSALS.has(option.kind));
	return refusal === undefined ? 'cancel' : { optionId: refusal.id };
};

/** One turn over `peer`: a stream to a process, or an in-process agent. */
export const promptAcpAgent = async (
	peer: Stream | AgentApp,
	input: IAcpPromptInput,
): Promise<IAcpPromptResult> => {
	const chunks: string[] = [];
	const decide = input.decide ?? refuse;
	const app = client({ name: 'delendai' })
		.onNotification(methods.client.session.update, ({ params }) => {
			const update = params.update;
			if (
				update.sessionUpdate === 'agent_message_chunk' &&
				update.content.type === 'text'
			) {
				chunks.push(update.content.text);
				input.onText?.(update.content.text);
			}
		})
		.onRequest(
			methods.client.session.requestPermission,
			async ({ params: request }) => {
				const decision = await decide({
					title:
						request.toolCall.title ?? request.toolCall.toolCallId,
					options: request.options.map((option) => ({
						id: option.optionId,
						name: option.name,
						kind: option.kind,
					})),
				});
				return decision === 'cancel'
					? { outcome: { outcome: 'cancelled' } }
					: {
							outcome: {
								outcome: 'selected',
								optionId: decision.optionId,
							},
						};
			},
		);
	const run = async (
		ctx: Parameters<Parameters<typeof app.connectWith>[1]>[0],
	) => {
		const hello = await ctx.request(methods.agent.initialize, {
			protocolVersion: PROTOCOL_VERSION,
			clientCapabilities: {
				fs: { readTextFile: false, writeTextFile: false },
				terminal: false,
			},
		});
		const authMethods = (hello.authMethods ?? []).map(
			(method) => method.id,
		);
		if (
			input.authMethodId !== undefined &&
			authMethods.includes(input.authMethodId)
		)
			await ctx.request(methods.agent.authenticate, {
				methodId: input.authMethodId,
			});
		const session = await ctx.request(methods.agent.session.new, {
			cwd: input.cwd,
			mcpServers: [],
		});
		const answer = await ctx.request(methods.agent.session.prompt, {
			sessionId: session.sessionId,
			prompt: [{ type: 'text', text: input.prompt }],
		});
		return {
			agent: {
				name: hello.agentInfo?.name,
				version: hello.agentInfo?.version,
			},
			protocolVersion: hello.protocolVersion,
			authMethods,
			modes: (session.modes?.availableModes ?? []).map((mode) => mode.id),
			stopReason: answer.stopReason,
			text: chunks.join(''),
			usage:
				answer.usage === undefined || answer.usage === null
					? undefined
					: {
							inputTokens: answer.usage.inputTokens,
							outputTokens: answer.usage.outputTokens,
							totalTokens: answer.usage.totalTokens,
						},
		};
	};
	return 'readable' in peer
		? app.connectWith(peer, run)
		: app.connectWith(peer, run);
};

/** Greet the agent and record what it says it is and can do; no session, nothing spent. */
export const introduceAcpAgent = async (
	peer: Stream | AgentApp,
): Promise<IAcpIntroduction> => {
	const app = client({ name: 'delendai' });
	const run = async (
		ctx: Parameters<Parameters<typeof app.connectWith>[1]>[0],
	) => {
		const hello = await ctx.request(methods.agent.initialize, {
			protocolVersion: PROTOCOL_VERSION,
			clientCapabilities: {
				fs: { readTextFile: false, writeTextFile: false },
				terminal: false,
			},
		});
		const prompt = hello.agentCapabilities?.promptCapabilities ?? {};
		return {
			agent: {
				name: hello.agentInfo?.name,
				version: hello.agentInfo?.version,
			},
			protocolVersion: hello.protocolVersion,
			authMethods: (hello.authMethods ?? []).map((method) => method.id),
			loadSession: hello.agentCapabilities?.loadSession === true,
			promptCapabilities: Object.entries(prompt)
				.filter(([, on]) => on === true)
				.map(([name]) => name),
		};
	};
	return 'readable' in peer
		? app.connectWith(peer, run)
		: app.connectWith(peer, run);
};
