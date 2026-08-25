import { describe, expect, it } from 'vitest';

import { measureBootstrapBytes } from '@mcp-vertex/core/lib/surface/bootstrap';

describe('surface bootstrap measurement', () => {
	it('counts only the bootstrap tool ids and estimates bytes deterministically', () => {
		const measurement = measureBootstrapBytes([
			{
				registrationId: 'overview',
				name: 'mcp-vertex_overview',
				toolId: 'overview',
				summary: 'orient',
			},
			{
				registrationId: 'status',
				name: 'mcp-vertex_status',
				toolId: 'status',
				summary: 'status',
			},
			{
				registrationId: 'memory_save',
				name: 'mcp-vertex_memory_save',
				toolId: 'save',
				pluginId: 'memory',
				namespace: 'memory',
				summary: 'hidden',
			},
		]);

		expect(measurement.tools).toBe(2);
		expect(measurement.bytes).toBeGreaterThan(0);
		expect(measurement.estimatedTokens).toBe(
			Math.ceil(measurement.bytes / 4),
		);
	});
});
