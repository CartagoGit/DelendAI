import type { IMcpTransport } from '../../src/lib/transport/mcp-transport.types';

export interface IFakeTransportFixture {
	readonly transport: IMcpTransport;
	readonly calls: ReadonlyArray<{
		readonly tool: string;
		readonly args: unknown;
	}>;
}

type ResponseMap = Readonly<Record<string, unknown>>;

export const createFakeTransport = (
	responses: ResponseMap = {},
): IFakeTransportFixture => {
	const calls: { tool: string; args: unknown }[] = [];
	const transport: IMcpTransport = {
		async callTool(args: { name: string; arguments?: unknown }) {
			calls.push({ tool: args.name, args: args.arguments });
			const response = responses[args.name];
			if (response === undefined) {
				return { content: [{ text: '{}' }], isError: false };
			}
			return {
				structuredContent: response,
				content: [{ text: JSON.stringify(response) }],
				isError: false,
			};
		},
		async listTools() {
			return { tools: [] };
		},
		async close() {
			return undefined;
		},
	};
	return { transport, calls };
};

export const sampleEvent = {
	ts: '2026-06-21T07:00:00.000Z',
	kind: 'tool-call',
	agent: 'a1',
	taskId: 'f00023',
	outcome: 'ok' as const,
	files: ['src/foo.ts'],
	summary: 'Plain summary, no secrets',
	meta: {},
};

export const queryFixture = {
	events: [sampleEvent],
	cursor: null,
	hasMore: false,
};

export const tailFixture = {
	events: [sampleEvent],
	oldestTs: sampleEvent.ts,
};

export const correlateFixture = {
	chain: [sampleEvent],
	firstTs: sampleEvent.ts,
	lastTs: sampleEvent.ts,
	gaps: [],
};

export const subscribeFixture = {
	events: [sampleEvent],
	stream: 'logs' as const,
};

export const redactTestFixture = {
	detected: ['aws-access-key'],
	redacted: 'AKIA***REDACTED***',
};
