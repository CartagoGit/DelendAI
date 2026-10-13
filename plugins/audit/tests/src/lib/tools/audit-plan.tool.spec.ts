import { describe, expect, it } from 'vitest';

import {
	ALL_SCOPES,
	SCORE_DIMENSIONS,
	SCOPE_LABEL,
	UNIVERSAL_SCOPES,
	buildBrief,
} from '../../../../src/lib/services/audit-brief.service';

describe('buildBrief', async () => {
	it('returns a non-empty markdown for every scope', async () => {
		for (const scope of ALL_SCOPES) {
			const md = buildBrief(scope);
			expect(md.length).toBeGreaterThan(200);
			expect(md).toContain('# 📋 Audit brief — mode');
		}
	});

	it('embeds the scope label in the header', async () => {
		const md = buildBrief('security');
		expect(md).toContain('Operational security');
	});

	it('lists every score dimension as a table row', async () => {
		const md = buildBrief('full');
		for (const dim of SCORE_DIMENSIONS) {
			expect(md).toContain(`| ${dim} |`);
		}
	});

	it('exposes canonical labels for every universal scope', async () => {
		expect(Object.keys(SCOPE_LABEL)).toEqual([...UNIVERSAL_SCOPES]);
		// ALL_SCOPES is an alias for UNIVERSAL_SCOPES (backwards compat)
		expect([...ALL_SCOPES]).toEqual([...UNIVERSAL_SCOPES]);
	});

	it('generates a parameterised brief for a custom layer scope', async () => {
		const layer = {
			name: 'api',
			label: 'API Layer',
			paths: ['src/api/', 'src/routes/'],
			checks: ['Verify rate limiting is applied on public endpoints'],
		};
		const md = buildBrief('api', { layers: [layer] });
		expect(md).toContain('API Layer');
		expect(md).toContain('src/api/');
		expect(md).toContain('src/routes/');
		expect(md).toContain('Verify rate limiting');
	});

	// l99 follow-up: `buildBrief` now accepts an optional `dimensions`
	// override so hosts can ship a custom rubric via the audit plugin's
	// `options.dimensions`. The default path is unchanged (canonical
	// 9 dimensions) and the override path is exercised below.

	it('falls back to SCORE_DIMENSIONS when no options are passed', async () => {
		const md = buildBrief('full');
		for (const dim of SCORE_DIMENSIONS) {
			expect(md).toContain(`| ${dim} | /10 |`);
		}
	});

	it('renders a custom dimensions array verbatim, in order', async () => {
		const custom = ['Calidad', 'Seguridad', 'Docs'];
		const md = buildBrief('full', { dimensions: custom });
		for (const dim of custom) {
			expect(md).toContain(`| ${dim} | /10 |`);
		}
		// The canonical dimensions must NOT appear when a custom
		// dimensions list replaces them — otherwise the host's rubric
		// would be diluted by the default.
		expect(md).not.toContain('| Genericidad (project-agnostic) | /10 |');
	});

	it('preserves an empty options object as "use defaults"', async () => {
		const md = buildBrief('full', {});
		for (const dim of SCORE_DIMENSIONS) {
			expect(md).toContain(`| ${dim} | /10 |`);
		}
	});
});
