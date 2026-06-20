import { describe, expect, it } from 'vitest';

import {
	ALL_SCOPES,
	SCORE_DIMENSIONS,
	SCOPE_LABEL,
	buildBrief,
} from '../src/lib/brief';

describe('buildBrief', () => {
	it('returns a non-empty markdown for every scope', () => {
		for (const scope of ALL_SCOPES) {
			const md = buildBrief(scope);
			expect(md.length).toBeGreaterThan(200);
			expect(md).toContain('# 📋 Brief de auditoría');
		}
	});

	it('embeds the scope label in the header', () => {
		const md = buildBrief('security');
		expect(md).toContain('Seguridad operacional');
	});

	it('lists every score dimension as a table row', () => {
		const md = buildBrief('full');
		for (const dim of SCORE_DIMENSIONS) {
			expect(md).toContain(`| ${dim} |`);
		}
	});

	it('exposes the canonical labels for every scope', () => {
		expect(Object.keys(SCOPE_LABEL)).toEqual([...ALL_SCOPES]);
	});

	// p99 follow-up: `buildBrief` now accepts an optional `dimensions`
	// override so hosts can ship a custom rubric via the audit plugin's
	// `options.dimensions`. The default path is unchanged (canonical
	// 9 dimensions) and the override path is exercised below.

	it('falls back to SCORE_DIMENSIONS when no options are passed', () => {
		const md = buildBrief('full');
		for (const dim of SCORE_DIMENSIONS) {
			expect(md).toContain(`| ${dim} | /10 |`);
		}
	});

	it('renders a custom dimensions array verbatim, in order', () => {
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

	it('preserves an empty options object as "use defaults"', () => {
		const md = buildBrief('full', {});
		for (const dim of SCORE_DIMENSIONS) {
			expect(md).toContain(`| ${dim} | /10 |`);
		}
	});
});
