import { describe, expect, it } from 'vitest';

import {
	autoFixPolicy,
	defaultSeverityForClassification,
	touchesPublicContracts,
} from '@mcp-vertex/proposals/lib/services/auto-fix-policy';

describe('auto-fix-policy', () => {
	it('routes high severity incidents to needs-human', () => {
		expect(
			autoFixPolicy({
				classification: 'BUG',
				severity: 'high',
				reproducible: true,
			}),
		).toEqual({
			decision: 'needs-human',
			reason: 'severity high requires human review',
		});
	});

	it('routes security classifications to needs-human by default severity', () => {
		expect(defaultSeverityForClassification('SECURITY')).toBe('critical');
		expect(
			autoFixPolicy({
				classification: 'SECURITY',
				reproducible: true,
			}),
		).toEqual({
			decision: 'needs-human',
			reason: 'severity critical requires human review',
		});
	});

	it('routes public index changes to needs-human', () => {
		expect(
			autoFixPolicy({
				classification: 'BUG',
				severity: 'low',
				reproducible: true,
				affectedPaths: ['packages/core/src/public/index.ts'],
			}),
		).toEqual({
			decision: 'needs-human',
			reason: 'public index path affected: packages/core/src/public/index.ts',
		});
	});

	it('routes published output schema changes to needs-human', () => {
		expect(
			touchesPublicContracts({
				affectsPublishedOutputSchema: true,
			}),
		).toEqual({
			touches: true,
			reason: 'published outputSchema contract would change',
		});
		expect(
			autoFixPolicy({
				classification: 'REGRESSION',
				severity: 'medium',
				reproducible: true,
				affectsPublishedOutputSchema: true,
			}),
		).toEqual({
			decision: 'needs-human',
			reason: 'published outputSchema contract would change',
		});
	});

	it('routes non reproducible bugs to needs-human', () => {
		expect(
			autoFixPolicy({
				classification: 'BUG',
				severity: 'medium',
				reproducible: false,
			}),
		).toEqual({
			decision: 'needs-human',
			reason: 'reproducible evidence is required for auto-fix',
		});
	});

	it('accepts low severity reproducible bugs with no public contract impact', () => {
		expect(
			autoFixPolicy({
				classification: 'BUG',
				severity: 'low',
				reproducible: true,
			}),
		).toEqual({
			decision: 'auto-fixable',
			reason: 'classification BUG with severity low is reproducible and avoids public contracts',
		});
	});

	it('accepts default-low doc drift when reproducible and contract-safe', () => {
		expect(defaultSeverityForClassification('DOC_DRIFT')).toBe('low');
		expect(
			autoFixPolicy({
				classification: 'DOC_DRIFT',
				reproducible: true,
			}),
		).toEqual({
			decision: 'auto-fixable',
			reason: 'classification DOC_DRIFT with severity low is reproducible and avoids public contracts',
		});
	});
});
