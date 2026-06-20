import { describe, expect, it } from 'vitest';

import {
	ALL_SCOPES,
	SCORE_DIMENSIONS,
	SCOPE_LABEL,
	buildBrief,
} from '@mcp-vertex/audit/lib/brief';

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
});
