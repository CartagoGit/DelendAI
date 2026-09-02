import { describe, expect, it } from 'vitest';

import { lintInvariantsLinkFix } from './invariants-link-fix.script';

describe('invariants-link-fix lint', () => {
	it('passes when a CIERTO invariant has no proposal reference at all', () => {
		const result = lintInvariantsLinkFix({
			files: {
				'docs/mcp-vertex/architecture/invariants/effects.md':
					'## Invariante: capabilities are observable\n\n**Estado actual**: CIERTO.\n',
			},
			knownProposalIds: new Set(),
		});
		expect(result).toEqual({ ok: true, violations: [] });
	});

	it('passes when a FALSO invariant references a real proposal id', () => {
		const result = lintInvariantsLinkFix({
			files: {
				'docs/mcp-vertex/architecture/invariants/adaptive-surface.md':
					'## Invariante: hysteresis\n\n**Estado actual**: NO IMPLEMENTADO (`AUD-C03`).\n\n**Si es FALSO/no implementado**: `f00273`.\n',
			},
			knownProposalIds: new Set(['f00273']),
		});
		expect(result).toEqual({ ok: true, violations: [] });
	});

	it('fails when a FALSO invariant references no proposal id at all', () => {
		const result = lintInvariantsLinkFix({
			files: {
				'docs/mcp-vertex/architecture/invariants/effects.md':
					'## Invariante: dry-run blocks effects\n\n**Estado actual**: FALSO.\n\nno fix mentioned here.\n',
			},
			knownProposalIds: new Set(['r00037']),
		});
		expect(result.ok).toBe(false);
		expect(result.violations[0]).toContain('dry-run blocks effects');
	});

	it('fails when a FALSO invariant cites an id that does not resolve to any real proposal', () => {
		const result = lintInvariantsLinkFix({
			files: {
				'docs/mcp-vertex/architecture/invariants/effects.md':
					'## Invariante: dry-run blocks effects\n\n**Estado actual**: FALSO.\n\nSee `r99999` for the fix.\n',
			},
			knownProposalIds: new Set(['r00037']),
		});
		expect(result.ok).toBe(false);
	});
});
