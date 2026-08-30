import { describe, expect, it } from 'vitest';

import { buildStableManifest, STABLE_API_TOOLS } from '@mcp-vertex/core/public';

describe('stable-manifest builder (f00152 S2)', () => {
	it('round-trips the facade list without crashing', () => {
		const manifest = buildStableManifest(
			STABLE_API_TOOLS,
			'9.9.9',
			'2026-07-26T00:00:00.000Z',
		);
		expect(manifest.tools.length).toBe(STABLE_API_TOOLS.length);
		expect(manifest.version.packageVersion).toBe('9.9.9');
	});

	it('preserves every facade tool name', () => {
		const manifest = buildStableManifest(STABLE_API_TOOLS, '0.1.0');
		const names = new Set(manifest.tools.map((tool) => tool.name));
		for (const descriptor of STABLE_API_TOOLS) {
			expect(names.has(descriptor.name)).toBe(true);
			expect(
				manifest.tools.find((tool) => tool.name === descriptor.name)
					?.inputSchema,
			).toEqual(expect.any(Object));
			expect(
				manifest.tools.find((tool) => tool.name === descriptor.name)
					?.outputSchema,
			).toEqual(expect.any(Object));
		}
	});

	it('is deterministic across two consecutive builds', () => {
		const a = buildStableManifest(
			STABLE_API_TOOLS,
			'0.1.0',
			'2026-07-26T00:00:00.000Z',
		);
		const b = buildStableManifest(
			STABLE_API_TOOLS,
			'0.1.0',
			'2026-07-26T00:00:00.000Z',
		);
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});
});
