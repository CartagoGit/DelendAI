import { describe, expect, it } from 'vitest';

import { buildBrief } from '../src/lib/brief';

/**
 * l125 s5 — the brief is the contract every model-side auditor reads
 * before producing a report. It must explicitly mention the 3
 * invariants this consolidation closed the drift on: `mcp-vertex_metrics`
 * as the observability primitive, `ctx.keepLegacy` as a per-plugin
 * contract every plugin must honour or explicitly ignore, and
 * `tool-outputs.ts` as a commit-time requirement for typed outputSchemas.
 */
describe('buildBrief — l125 s5 invariants', () => {
	it('mentions mcp-vertex_metrics as the canonical observability primitive', () => {
		const md = buildBrief('full');
		expect(md).toContain('mcp-vertex_metrics');
	});

	it('mentions ctx.keepLegacy as a contract every plugin must honour or explicitly ignore', () => {
		const md = buildBrief('full');
		expect(md).toContain('keepLegacy');
	});

	it('mentions tool-outputs.ts as a commit-time requirement for typed outputSchemas', () => {
		const md = buildBrief('full');
		expect(md).toContain('tool-outputs.ts');
	});

	it('all 3 mentions survive across every scope, not just "full"', () => {
		for (const scope of [
			'full',
			'core',
			'plugins',
			'web',
			'security',
			'tokens',
			'tests',
			'docs',
		] as const) {
			const md = buildBrief(scope);
			expect(md).toContain('mcp-vertex_metrics');
			expect(md).toContain('keepLegacy');
			expect(md).toContain('tool-outputs.ts');
		}
	});
});
