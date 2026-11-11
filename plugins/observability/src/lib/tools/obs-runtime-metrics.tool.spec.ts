import { describe, expect, it } from 'vitest';

import { buildObsHealthToolRegistration } from './obs-health.tool';
import { buildObsRuntimeMetricsToolRegistration } from './obs-runtime-metrics.tool';
import { createRuntimeMetricsRegistry } from '../metrics/runtime-metrics-registry';
import {
	fakeReadTracesDeps,
	type IReadonlyTraceRecord,
} from '../traces/interfaces';
import { FakeServer, parseOk } from '../testing/tool-spec-server.helper';

const traceRecords: readonly IReadonlyTraceRecord[] = [
	{
		service: 'web',
		traceId: 't-1',
		ts: '2026-07-25T10:00:00Z',
		isError: false,
	},
];

describe('obs_runtime_metrics', () => {
	it('registers under the namespace prefix', async () => {
		const server = new FakeServer();
		await buildObsRuntimeMetricsToolRegistration({
			namespacePrefix: 'obs',
			registry: createRuntimeMetricsRegistry(),
		}).register(server.asServer);
		expect(Object.keys(server.tools)).toEqual(['obs_obs_runtime_metrics']);
	});

	it('starts in the discriminated no-samples state — never a bare null or zero', async () => {
		const server = new FakeServer();
		await buildObsRuntimeMetricsToolRegistration({
			namespacePrefix: 'obs',
			registry: createRuntimeMetricsRegistry(),
		}).register(server.asServer);
		const out = parseOk(
			await server.tools.obs_obs_runtime_metrics!.handler({}),
		);
		expect(out).toEqual({ calls: 0, responses: { hasSamples: false } });
	});

	it('reports a real sample after obs_trace runs, sharing one registry', async () => {
		const registry = createRuntimeMetricsRegistry();
		const healthServer = new FakeServer();
		await buildObsHealthToolRegistration({
			namespacePrefix: 'obs',
			tracesDeps: fakeReadTracesDeps(traceRecords),
			metricsRegistry: registry,
		}).register(healthServer.asServer);
		await healthServer.tools.obs_obs_trace!.handler({ limit: 10 });

		const metricsServer = new FakeServer();
		await buildObsRuntimeMetricsToolRegistration({
			namespacePrefix: 'obs',
			registry,
		}).register(metricsServer.asServer);
		const out = parseOk(
			await metricsServer.tools.obs_obs_runtime_metrics!.handler({}),
		);
		expect(out.calls).toBe(1);
		const responses = out.responses as { hasSamples: boolean };
		expect(responses.hasSamples).toBe(true);
	});

	it('reset:true zeroes the sample window after reading', async () => {
		const registry = createRuntimeMetricsRegistry();
		registry.recordResponseBytes(123);
		const server = new FakeServer();
		await buildObsRuntimeMetricsToolRegistration({
			namespacePrefix: 'obs',
			registry,
		}).register(server.asServer);

		const first = parseOk(
			await server.tools.obs_obs_runtime_metrics!.handler({
				reset: true,
			}),
		);
		expect(first.calls).toBe(1);

		const second = parseOk(
			await server.tools.obs_obs_runtime_metrics!.handler({}),
		);
		expect(second).toEqual({ calls: 0, responses: { hasSamples: false } });
	});
});
