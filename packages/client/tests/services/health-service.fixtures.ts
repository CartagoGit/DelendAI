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

export const healthyFixture = {
	proposals_state_health: {
		healthy: true,
		locks: { active: 3 },
		queue: null,
		registry: { orphans: 0, threshold: '1d' },
	},
	proposals_proposal_stale_list: { ok: true, count: 0, zombies: [] },
	proposals_agent_names: { agents: [{ name: 'a1' }, { name: 'a2' }] },
};

export const unhealthyFixture = {
	proposals_state_health: {
		healthy: false,
		locks: { active: 7 },
		queue: {
			queueLength: 4,
			queuedCount: 2,
			waiterOrphans: 1,
			oldestAgeMinutes: 12,
			threshold: '10m',
		},
		registry: { orphans: 2, threshold: '1d' },
	},
	proposals_proposal_stale_list: {
		ok: true,
		count: 1,
		zombies: [
			{
				kind: 'agent-idle' as const,
				agent: 'a-stale',
				taskId: 'f126',
				ts: '2026-06-21T00:00:00Z',
				lastSeen: '2026-06-21T00:00:00Z',
				missedBeats: 5,
				suggestedActions: ['restart'],
			},
		],
	},
	proposals_agent_names: {
		agents: [{ name: 'a1' }, { name: 'a-stale' }],
	},
};
