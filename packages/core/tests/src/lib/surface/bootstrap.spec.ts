import { describe, expect, it } from 'vitest';

import {
	measureBootstrapBytes,
	measureToolWireBytes,
} from '@delendai/core/lib/surface/bootstrap';

describe('surface bootstrap measurement (AUD-B04 / x00284)', () => {
	it('measures the real tools/list shape — name/description/inputSchema, not name/toolId/summary', () => {
		// Before this fix `measureBootstrapBytes` serialised
		// `{name, toolId, summary}` — none of `toolId`/`summary` are real
		// MCP wire fields, and `inputSchema`/`outputSchema` were entirely
		// absent. This asserts the NEW shape by construction: the type
		// system itself no longer accepts `toolId`/`summary`/`pluginId`
		// (see the excess-property rejection this file would produce if
		// you tried to pass the old descriptor shape here).
		const measurement = measureBootstrapBytes([
			{
				name: 'delendai_overview',
				description: 'Orient in one call.',
				inputSchema: { type: 'object', properties: {} },
			},
			{
				name: 'delendai_status',
				description: 'Server status.',
				inputSchema: { type: 'object', properties: {} },
			},
		]);

		expect(measurement.tools).toBe(2);
		expect(measurement.bytes).toBeGreaterThan(0);
		expect(measurement.estimatedTokens).toBe(
			Math.ceil(measurement.bytes / 4),
		);
	});

	it('omits description/outputSchema/annotations when undefined, matching JSON.stringify over a real tools/list entry', () => {
		const bare = measureToolWireBytes({ name: 'delendai_bare' });
		const expected = Buffer.byteLength(
			JSON.stringify({
				name: 'delendai_bare',
				inputSchema: { type: 'object', properties: {} },
			}),
			'utf8',
		);
		expect(bare).toBe(expected);
	});

	it('defaults a missing inputSchema to the SDK empty-object schema instead of 0 bytes', () => {
		// The MCP SDK never actually sends a tool with no `inputSchema` —
		// it falls back to `{type:'object',properties:{}}`
		// (`server/mcp.js`'s `EMPTY_OBJECT_JSON_SCHEMA`). Treating "no
		// schema" as "no bytes" would have been exactly the kind of
		// silent undercount AUD-B04 flagged.
		const withNoSchema = measureToolWireBytes({ name: 'x' });
		const withEmptySchema = measureToolWireBytes({
			name: 'x',
			inputSchema: { type: 'object', properties: {} },
		});
		expect(withNoSchema).toBe(withEmptySchema);
		expect(withNoSchema).toBeGreaterThan(
			Buffer.byteLength(JSON.stringify({ name: 'x' }), 'utf8'),
		);
	});

	it('a growing outputSchema moves the measurement — the exact gap AUD-B04 named ("no puede ver un outputSchema crecer en absoluto")', () => {
		const base = {
			name: 'delendai_grows',
			inputSchema: { type: 'object', properties: {} },
		} as const;
		const smallOutputSchema = measureToolWireBytes({
			...base,
			outputSchema: {
				type: 'object',
				properties: { ok: { type: 'boolean' } },
			},
		});
		const largeOutputSchema = measureToolWireBytes({
			...base,
			outputSchema: {
				type: 'object',
				properties: {
					ok: { type: 'boolean' },
					items: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								id: { type: 'string' },
								title: { type: 'string' },
								tags: {
									type: 'array',
									items: { type: 'string' },
								},
								createdAt: { type: 'string' },
								metadata: {
									type: 'object',
									properties: {
										source: { type: 'string' },
										confidence: { type: 'number' },
									},
								},
							},
						},
					},
				},
			},
		});
		// The pre-fix shape had no `outputSchema` field at all, so this
		// delta would have been silently 0 no matter how much the real
		// schema grew.
		expect(largeOutputSchema).toBeGreaterThan(smallOutputSchema);
		expect(largeOutputSchema - smallOutputSchema).toBeGreaterThan(200);
	});
});
