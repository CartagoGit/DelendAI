/**
 * fake-acp-agent.ts — a minimal agent speaking ACP on stdio, for the
 * process-level spec of acp-client.service. It answers one prompt with
 * the text it was sent, reversed.
 */
import { Readable, Writable } from 'node:stream';

import {
	agent,
	methods,
	ndJsonStream,
	PROTOCOL_VERSION,
} from '@agentclientprotocol/sdk';

agent({ name: 'fake-stdio' })
	.onRequest(methods.agent.initialize, () => ({
		protocolVersion: PROTOCOL_VERSION,
		agentCapabilities: {},
		agentInfo: { name: 'Fake Stdio', version: '1.0.0' },
	}))
	.onRequest(methods.agent.session.new, () => ({ sessionId: 's' }))
	.onRequest(
		methods.agent.session.prompt,
		async ({ params, client: peer }) => {
			const first = params.prompt[0];
			const text = first?.type === 'text' ? first.text : '';
			await peer.notify(methods.client.session.update, {
				sessionId: params.sessionId,
				update: {
					sessionUpdate: 'agent_message_chunk',
					content: {
						type: 'text',
						text: [...text].reverse().join(''),
					},
				},
			});
			return { stopReason: 'end_turn' };
		},
	)
	.connect(
		ndJsonStream(
			Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
			Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
		),
	);
