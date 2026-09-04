import { describe, expect, it } from 'vitest';

import {
	buildObsHealthToolRegistration,
	buildObsRuntimeMetricsToolRegistration,
	createRuntimeMetricsRegistry,
} from '@delendai/observability/public';
import { buildAdaptiveOptimizerToolRegistrations } from '@delendai/adaptive-optimizer/public';

import {
	PLUGIN_METRICS_TOOL_SUFFIXES,
	collectPluginMetrics,
} from './collect-candidate.script.ts';
import { PluginMetricsSnapshotSchema } from './payload-percentile.schema.ts';

class FakeServer {
	tools: Record<string, { handler: (args: unknown) => Promise<unknown> }> =
		{};

	registerTool(
		name: string,
		_meta: unknown,
		handler: (args: unknown) => Promise<unknown>,
	) {
		this.tools[name] = { handler };
	}
}

/** Minimal fake of the MCP `Client` surface `collectPluginMetrics` uses. */
class FakeClient {
	constructor(
		private readonly server: FakeServer,
		private readonly namespacePrefix: string,
	) {}

	async callTool(args: { name: string; arguments: unknown }) {
		const handler = this.server.tools[args.name]?.handler;
		if (handler === undefined) throw new Error(`unknown tool ${args.name}`);
		return handler(args.arguments);
	}

	get toolList() {
		return Object.keys(this.server.tools).map((name) => ({ name }));
	}

	prefixed(id: string) {
		return `${this.namespacePrefix}_${id}`;
	}
}

describe('collect-candidate.script — tool-name drift guard (f00027)', () => {
	it('the tracked suffixes match exactly what observability + adaptive-optimizer register', async () => {
		const server = new FakeServer();
		await buildObsRuntimeMetricsToolRegistration({
			namespacePrefix: 'mcp-vertex',
			registry: createRuntimeMetricsRegistry(),
		}).register(server as never);
		for (const registration of buildAdaptiveOptimizerToolRegistrations({
			namespacePrefix: 'mcp-vertex',
			workspaceRootAbs: '/workspace',
			maxBytes: 2000,
			discoverRosterFn: async () => ({ available: [], missing: [] }),
		})) {
			await registration.register(server as never);
		}

		const registeredNames = Object.keys(server.tools);
		for (const suffix of PLUGIN_METRICS_TOOL_SUFFIXES) {
			expect(
				registeredNames.some((name) => name.endsWith(suffix)),
				`expected a registered tool ending in "${suffix}", got: ${registeredNames.join(', ')}`,
			).toBe(true);
		}
	});
});

describe('collectPluginMetrics — no-samples representation end to end', () => {
	it('collects the discriminated no-samples state without ever seeing a null', async () => {
		const server = new FakeServer();
		await buildObsRuntimeMetricsToolRegistration({
			namespacePrefix: 'mcp-vertex',
			registry: createRuntimeMetricsRegistry(),
		}).register(server as never);
		const fakeClient = new FakeClient(server, 'mcp-vertex');

		const collected = await collectPluginMetrics(
			fakeClient as never,
			fakeClient.toolList,
		);

		const entry = collected['mcp-vertex_obs_runtime_metrics'];
		expect(entry).toBeDefined();
		expect(entry?.responses).toEqual({ hasSamples: false });
		expect(entry?.responses).not.toHaveProperty('p95PayloadBytes');
	});

	it('collects a finite p95 once obs_trace has produced a real sample', async () => {
		const registry = createRuntimeMetricsRegistry();
		const server = new FakeServer();
		await buildObsHealthToolRegistration({
			namespacePrefix: 'mcp-vertex',
			tracesDeps: {
				listTraceRecords: async () => [
					{
						service: 'web',
						traceId: 't-1',
						ts: '2026-07-25T10:00:00Z',
						isError: false,
					},
				],
			},
			metricsRegistry: registry,
		}).register(server as never);
		await buildObsRuntimeMetricsToolRegistration({
			namespacePrefix: 'mcp-vertex',
			registry,
		}).register(server as never);
		const fakeClient = new FakeClient(server, 'mcp-vertex');

		await fakeClient.callTool({
			name: 'mcp-vertex_obs_trace',
			arguments: { limit: 10 },
		});
		const collected = await collectPluginMetrics(fakeClient as never, [
			{ name: 'mcp-vertex_obs_runtime_metrics' },
		]);

		const entry = collected['mcp-vertex_obs_runtime_metrics'];
		expect(entry?.responses.hasSamples).toBe(true);
		if (entry?.responses.hasSamples === true) {
			expect(Number.isFinite(entry.responses.p95PayloadBytes)).toBe(true);
		}
	});

	it('the legacy null-based shape (the actual f00027 bug) fails schema validation instead of silently coercing to zero', () => {
		const legacyPayload = {
			calls: 0,
			responses: { p95PayloadBytes: null },
		};
		const result = PluginMetricsSnapshotSchema.safeParse(legacyPayload);
		expect(result.success).toBe(false);
	});

	it('drops a tool whose response fails validation instead of writing malformed data', async () => {
		const server = new FakeServer();
		server.registerTool('mcp-vertex_obs_runtime_metrics', {}, async () => ({
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						calls: 0,
						responses: { p95PayloadBytes: null },
					}),
				},
			],
		}));
		const fakeClient = new FakeClient(server, 'mcp-vertex');

		const collected = await collectPluginMetrics(fakeClient as never, [
			{ name: 'mcp-vertex_obs_runtime_metrics' },
		]);

		expect(collected).toEqual({});
	});
});
