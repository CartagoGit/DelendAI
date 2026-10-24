/**
 * acp-session.service.spec.ts — one prompt turn with an agent that speaks
 * the Agent Client Protocol, driven against a fake agent in process.
 */
import { agent, methods, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vitest';

import type { IAcpPermissionAsk } from '../../../../src/lib/contracts/interfaces/acp.interface';
import {
	introduceAcpAgent,
	promptAcpAgent,
} from '../../../../src/lib/shared/acp-session.service';

/** A fake agent: streams two chunks, asks once before acting, reports usage. */
const fakeAgent = (seen: { permission?: unknown; auth?: string }) =>
	agent({ name: 'fake' })
		.onRequest(methods.agent.initialize, () => ({
			protocolVersion: PROTOCOL_VERSION,
			agentCapabilities: {},
			authMethods: [{ id: 'api-key', name: 'API key' }],
			agentInfo: { name: 'Fake Agent', version: '9.1.0' },
		}))
		.onRequest(methods.agent.authenticate, ({ params }) => {
			seen.auth = params.methodId;
			return {};
		})
		.onRequest(methods.agent.session.new, () => ({
			sessionId: 's1',
			modes: {
				currentModeId: 'code',
				availableModes: [
					{ id: 'code', name: 'Code' },
					{ id: 'ask', name: 'Ask' },
				],
			},
		}))
		.onRequest(
			methods.agent.session.prompt,
			async ({ params, client: peer }) => {
				for (const text of ['Hello ', 'world'])
					await peer.notify(methods.client.session.update, {
						sessionId: params.sessionId,
						update: {
							sessionUpdate: 'agent_message_chunk',
							content: { type: 'text', text },
						},
					});
				seen.permission = await peer.request(
					methods.client.session.requestPermission,
					{
						sessionId: params.sessionId,
						toolCall: {
							toolCallId: 't1',
							title: 'Run rm -rf build',
						},
						options: [
							{
								optionId: 'yes',
								name: 'Allow',
								kind: 'allow_once',
							},
							{
								optionId: 'no',
								name: 'Reject',
								kind: 'reject_once',
							},
						],
					},
				);
				return {
					stopReason: 'end_turn',
					usage: {
						inputTokens: 10,
						outputTokens: 5,
						totalTokens: 15,
					},
				};
			},
		);

describe('promptAcpAgent', () => {
	it('runs a turn and reports what the agent says about itself and what it cost', async () => {
		const seen: { permission?: unknown; auth?: string } = {};
		const streamed: string[] = [];
		const result = await promptAcpAgent(fakeAgent(seen), {
			cwd: '/ws',
			prompt: 'hi',
			onText: (chunk) => streamed.push(chunk),
			authMethodId: 'api-key',
		});
		expect(result).toMatchObject({
			agent: { name: 'Fake Agent', version: '9.1.0' },
			authMethods: ['api-key'],
			modes: ['code', 'ask'],
			stopReason: 'end_turn',
			text: 'Hello world',
			usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
		});
		expect(streamed).toEqual(['Hello ', 'world']);
		expect(seen.auth).toBe('api-key');
	});

	it('refuses what the agent asks to do when no one decides', async () => {
		const seen: { permission?: unknown } = {};
		await promptAcpAgent(fakeAgent(seen), { cwd: '/ws', prompt: 'hi' });
		expect(seen.permission).toEqual({
			outcome: { outcome: 'selected', optionId: 'no' },
		});
	});

	it('asks the caller, who may allow or cancel', async () => {
		const asks: IAcpPermissionAsk[] = [];
		const allowed: { permission?: unknown } = {};
		await promptAcpAgent(fakeAgent(allowed), {
			cwd: '/ws',
			prompt: 'hi',
			decide: async (ask) => {
				asks.push(ask);
				return { optionId: 'yes' };
			},
		});
		expect(asks[0]?.title).toBe('Run rm -rf build');
		expect(allowed.permission).toEqual({
			outcome: { outcome: 'selected', optionId: 'yes' },
		});
		const cancelled: { permission?: unknown } = {};
		await promptAcpAgent(fakeAgent(cancelled), {
			cwd: '/ws',
			prompt: 'hi',
			decide: async () => 'cancel',
		});
		expect(cancelled.permission).toEqual({
			outcome: { outcome: 'cancelled' },
		});
	});
});

describe('introduceAcpAgent', () => {
	it('records what the agent says it is, without opening a session', async () => {
		const opened: string[] = [];
		const peer = agent({ name: 'intro' })
			.onRequest(methods.agent.initialize, () => ({
				protocolVersion: PROTOCOL_VERSION,
				agentCapabilities: {
					loadSession: true,
					promptCapabilities: { image: true, audio: false },
				},
				authMethods: [{ id: 'login', name: 'Log in' }],
				agentInfo: { name: 'Intro', version: '2.0.0' },
			}))
			.onRequest(methods.agent.session.new, () => {
				opened.push('session');
				return { sessionId: 'x' };
			});
		expect(await introduceAcpAgent(peer)).toEqual({
			agent: { name: 'Intro', version: '2.0.0' },
			protocolVersion: PROTOCOL_VERSION,
			authMethods: ['login'],
			loadSession: true,
			promptCapabilities: ['image'],
		});
		expect(opened).toEqual([]);
	});
});
