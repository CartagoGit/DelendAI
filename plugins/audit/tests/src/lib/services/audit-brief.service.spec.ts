import { describe, expect, it } from 'vitest';

import { buildBrief } from '../src/lib/brief';

/**
 * The brief is the contract every model-side auditor reads before
 * producing a report. It must stay **project-agnostic** by default so
 * the same brief works for any host (mcp-vertex or not); hosts that
 * want to inject project-specific invariants pass them via
 * {@link IBriefOptions.crossCuttingAdditions}.
 *
 * These tests pin the agnostic contract:
 *  - The default brief must NOT leak mcp-vertex-specific vocabulary.
 *  - The default brief must still surface the 3 universal cross-cutting
 *    invariants (observability, flag honoring, generated typed outputs)
 *    in project-agnostic language.
 *  - Hosts can inject their own cross-cutting invariants and they
 *    appear in every scope's brief (not just `full`).
 */
describe('buildBrief — project-agnostic defaults', () => {
	it('does NOT leak mcp-vertex-specific vocabulary in the default brief', () => {
		const md = buildBrief('full');
		expect(md).not.toContain('mcp-vertex_metrics');
		expect(md).not.toContain('ctx.keepLegacy');
		expect(md).not.toContain('tool-outputs.ts');
		expect(md).not.toContain('types:generate');
	});

	it('does NOT mention mcp-vertex.config.json in the default brief', () => {
		const md = buildBrief('full');
		expect(md).not.toContain('mcp-vertex.config.json');
	});

	it('surfaces the 3 universal cross-cutting invariants in agnostic language', () => {
		const md = buildBrief('full');
		expect(md).toMatch(/Observabilidad/i);
		expect(md).toMatch(/Honoring.*flags|honoring.*configuraci[oó]n/iu);
		expect(md).toMatch(/Outputs? tipados?|generated typed outputs/i);
	});

	it('uses `<config-file>` placeholder by default when no layers are configured', () => {
		const md = buildBrief('full');
		expect(md).toContain('<config-file>');
	});

	it('renders the host `configFileName` in the no-layers hint', () => {
		const md = buildBrief('full', { configFileName: 'app.toml' });
		expect(md).toContain('app.toml');
		expect(md).not.toContain('<config-file>');
	});

	it('renders the host `projectName` in the no-layers section header', () => {
		const md = buildBrief('full', { projectName: 'Acme Monorepo' });
		expect(md).toContain('Código fuente de Acme Monorepo');
	});

	it('injects host `crossCuttingAdditions` into every scope', () => {
		const customInvariant =
			'- **mcp-vertex_metrics**: primitiva canónica de observabilidad (host-specific).';
		for (const scope of [
			'full',
			'security',
			'tokens',
			'tests',
			'docs',
		] as const) {
			const md = buildBrief(scope, {
				crossCuttingAdditions: [customInvariant],
			});
			expect(md).toContain('mcp-vertex_metrics');
			expect(md).toContain('host-specific');
		}
	});

	it('universal defaults render even when no `crossCuttingAdditions` are passed', () => {
		const md = buildBrief('full');
		expect(md).toContain('Invariantes transversales');
		// Universal defaults must be present in their agnostic form.
		expect(md).toMatch(/Observabilidad/i);
	});
});
