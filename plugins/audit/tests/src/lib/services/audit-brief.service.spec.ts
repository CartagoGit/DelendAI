import { describe, expect, it } from 'vitest';

import { buildBrief } from '../../../../src/lib/services/audit-brief.service';

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
describe('buildBrief — project-agnostic defaults', async () => {
	it('does NOT leak mcp-vertex-specific vocabulary in the default brief', async () => {
		const md = buildBrief('full');
		expect(md).not.toContain('mcp-vertex_metrics');
		expect(md).not.toContain('ctx.keepLegacy');
		expect(md).not.toContain('tool-outputs.ts');
		expect(md).not.toContain('types:generate');
	});

	it('does NOT mention mcp-vertex.config.json in the default brief', async () => {
		const md = buildBrief('full');
		expect(md).not.toContain('mcp-vertex.config.json');
	});

	it('surfaces the 3 universal cross-cutting invariants in agnostic language', async () => {
		const md = buildBrief('full');
		expect(md).toMatch(/Observability/i);
		expect(md).toMatch(/Configuration flag honoring/i);
		expect(md).toMatch(/generated typed outputs/i);
	});

	it('uses `<config-file>` placeholder by default when no layers are configured', async () => {
		const md = buildBrief('full');
		expect(md).toContain('<config-file>');
	});

	it('renders the host `configFileName` in the no-layers hint', async () => {
		const md = buildBrief('full', { configFileName: 'app.toml' });
		expect(md).toContain('app.toml');
		expect(md).not.toContain('<config-file>');
	});

	it('renders the host `projectName` in the no-layers section header', async () => {
		const md = buildBrief('full', { projectName: 'Acme Monorepo' });
		expect(md).toContain('Acme Monorepo source code');
	});

	it('injects host `crossCuttingAdditions` into every scope', async () => {
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

	it('universal defaults render even when no `crossCuttingAdditions` are passed', async () => {
		const md = buildBrief('full');
		expect(md).toContain('Cross-cutting invariants');
		// Universal defaults must be present in their agnostic form.
		expect(md).toMatch(/Observability/i);
	});
});

// ---------------------------------------------------------------------------
// Audit modes (general / specific / monorepo) + ESPLÉNDIDO band
// ---------------------------------------------------------------------------

describe('buildBrief — audit modes', async () => {
	const layers = [
		{
			name: 'core',
			label: 'Core packages',
			paths: ['packages/core/src/'],
		},
		{
			name: 'plugins',
			label: 'Plugin packages',
			paths: ['plugins/proposals/src/', 'plugins/audit/src/'],
		},
		{
			name: 'extensions',
			label: 'IDE extension',
			paths: ['extensions/vscode/src/'],
		},
	];

	it('renders the new EXEMPLARY band as the 7th severity tier (pure English)', async () => {
		const md = buildBrief('full');
		// The brief header carries the EXEMPLARY label in the rubric
		// table; everything in the brief is pure English (no Spanish
		// vocabulary leaked into the table itself).
		expect(md).toContain('EXEMPLARY');
		expect(md).toContain('✨');
		expect(md).toContain('FATAL');
		expect(md).toContain('BAD');
		expect(md).toContain('MINOR');
		expect(md).toContain('OK');
		expect(md).toContain('GOOD');
		expect(md).toContain('PERFECT');
	});

	it('general mode (default) renders every configured layer phase', async () => {
		const md = buildBrief('full', { layers });
		expect(md).toContain('Core packages');
		expect(md).toContain('Plugin packages');
		expect(md).toContain('IDE extension');
		expect(md).toMatch(/mode general/i);
	});

	it('specific mode renders only the requested layer phase', async () => {
		const md = buildBrief('core', {
			layers,
			mode: 'specific',
		});
		expect(md).toContain('Core packages');
		// Other layers MUST NOT appear in the reading phases when a
		// specific scope is requested.
		expect(md).not.toContain('Plugin packages');
		expect(md).not.toContain('IDE extension');
		expect(md).toMatch(/mode specific/i);
	});

	it('monorepo mode filters the layer phases to the named projects', async () => {
		const md = buildBrief('full', {
			layers,
			mode: 'monorepo',
			projects: ['core', 'plugins'],
		});
		expect(md).toContain('Core packages');
		expect(md).toContain('Plugin packages');
		// The unselected layer must NOT be rendered.
		expect(md).not.toContain('IDE extension');
		expect(md).toMatch(/mode monorepo/i);
		expect(md).toContain('core');
		expect(md).toContain('plugins');
	});

	it('monorepo badge surfaces the selected projects for reviewer clarity', async () => {
		const md = buildBrief('full', {
			layers,
			mode: 'monorepo',
			projects: ['core', 'extensions'],
		});
		expect(md).toMatch(/Monorepo mode active[\s\S]*`core`/iu);
		expect(md).toMatch(/`extensions`/u);
		// 'plugins' is in the configured set but not selected; the
		// badge must NOT include it.
		expect(md).not.toMatch(/Monorepo mode active[\s\S]*`plugins`/iu);
	});

	it('infers monorepo mode when `projects` is non-empty even without explicit mode', async () => {
		const md = buildBrief('full', { layers, projects: ['core'] });
		expect(md).toMatch(/mode monorepo/i);
		expect(md).toContain('Core packages');
		expect(md).not.toContain('Plugin packages');
	});

	it('infers specific mode when scope is a layer name (no projects, no explicit mode)', async () => {
		const md = buildBrief('plugins', { layers });
		expect(md).toMatch(/mode specific/i);
		expect(md).toContain('Plugin packages');
		expect(md).not.toContain('Core packages');
	});

	it('infers general mode when scope is "full" (default)', async () => {
		const md = buildBrief('full', { layers });
		expect(md).toMatch(/mode general/i);
	});

	it('renders the three-mode legend so reviewers can see the contract', async () => {
		const md = buildBrief('full', { layers });
		expect(md).toMatch(/`general`/);
		expect(md).toMatch(/`specific`/);
		expect(md).toMatch(/`monorepo`/);
	});

	it('preserves backward compat — empty projects array equals "audit every layer"', async () => {
		const md = buildBrief('full', { layers, projects: [] });
		expect(md).toContain('Core packages');
		expect(md).toContain('Plugin packages');
		expect(md).toContain('IDE extension');
	});
});
