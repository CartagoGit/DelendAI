/**
 * fake-acp-agent.ts — a minimal agent speaking ACP on stdio, for the
 * process-level spec of acp-client.service. It answers one prompt with
 * the text it was sent, reversed.
 */
import {
	agent,
	methods,
	ndJsonStream,
	PROTOCOL_VERSION,
} from '@agentclientprotocol/sdk';

// Self-contained: the spec starts it with the test runtime's own binary.
const input = new ReadableStream<Uint8Array>({
	start(controller) {
		process.stdin.on('data', (chunk: Buffer) =>
			controller.enqueue(new Uint8Array(chunk)),
		);
		process.stdin.on('end', () => controller.close());
	},
});
const output = new WritableStream<Uint8Array>({
	write(chunk) {
		process.stdout.write(chunk);
	},
});

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
	.connect(ndJsonStream(output, input));
