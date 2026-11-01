/**
 * fake-acp-coder.ts — an agent speaking ACP on stdio for the acp invoker's
 * end-to-end spec: it streams an answer, asks to run a shell command and
 * to read a file, and reports what it was told.
 */
import {
	agent,
	methods,
	ndJsonStream,
	PROTOCOL_VERSION,
} from '@agentclientprotocol/sdk';

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

agent({ name: 'fake-coder' })
	.onRequest(methods.agent.initialize, () => ({
		protocolVersion: PROTOCOL_VERSION,
		agentCapabilities: {},
		agentInfo: { name: 'Fake Coder', version: '0.1.0' },
	}))
	.onRequest(methods.agent.session.new, () => ({ sessionId: 's' }))
	.onRequest(
		methods.agent.session.prompt,
		async ({ params, client: peer }) => {
			const ask = async (title: string) =>
				peer.request(methods.client.session.requestPermission, {
					sessionId: params.sessionId,
					toolCall: { toolCallId: title, title },
					options: [
						{ optionId: 'yes', name: 'Allow', kind: 'allow_once' },
						{ optionId: 'no', name: 'Reject', kind: 'reject_once' },
					],
				});
			const shell = await ask('Bash: rm -rf build');
			const read = await ask('Read src/index.ts');
			const said = (answer: {
				outcome: { outcome: string; optionId?: string };
			}) =>
				answer.outcome.outcome === 'selected'
					? (answer.outcome.optionId ?? '')
					: 'cancelled';
			const first = params.prompt[0];
			await peer.notify(methods.client.session.update, {
				sessionId: params.sessionId,
				update: {
					sessionUpdate: 'agent_message_chunk',
					content: {
						type: 'text',
						text: `task=${first?.type === 'text' ? first.text : ''} bash=${said(shell)} read=${said(read)}`,
					},
				},
			});
			return {
				stopReason: 'end_turn',
				usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
			};
		},
	)
	.connect(ndJsonStream(output, input));
