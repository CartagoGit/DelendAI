import { describe, expect, it } from 'vitest';

import { parseAuthorityDeclarations } from '@delendai/core/public';

import { collectAuthorities, renderAuthorities } from './authorities.script';
import { REPO_AUTHORITIES } from './repo-authorities.constant';

const fact = (domain: string) => ({
	domain,
	authority: `src/${domain}.ts`,
	projections: [{ path: `gen/${domain}.json`, producer: `gen-${domain}.ts` }],
});

describe('collectAuthorities', () => {
	it('sorts every source’s declarations by domain', () => {
		const declared = collectAuthorities([
			{ source: 'a', declarations: [fact('zeta')] },
			{ source: 'b', declarations: [fact('alpha')] },
		]);
		expect(declared.map((d) => d.declaration.domain)).toEqual([
			'alpha',
			'zeta',
		]);
	});

	it('refuses one domain declared by two sources', () => {
		expect(() =>
			collectAuthorities([
				{ source: 'this repository', declarations: [fact('status')] },
				{ source: 'plugin `x`', declarations: [fact('status')] },
			]),
		).toThrow(
			/"status" is declared by both this repository and plugin `x`/u,
		);
	});
});

describe('renderAuthorities', () => {
	it('names the authority, the projections with their producers, and the gates', () => {
		const page = renderAuthorities(
			collectAuthorities([
				{
					source: 'this repository',
					declarations: [
						{
							...fact('status'),
							driftGate: 'lint:status',
							rebuild: 'bun run x',
						},
					],
				},
			]),
		);
		expect(page).toContain('## status');
		expect(page).toContain('- **Authority**: `src/status.ts`');
		expect(page).toContain('| `gen/status.json` | `gen-status.ts` |');
		expect(page).toContain('- **Drift gate**: `lint:status`');
		expect(page).not.toContain('Reconciler');
		expect(page.endsWith('\n')).toBe(true);
	});
});

describe('this repository’s declarations', () => {
	it('satisfy the rules a manifest’s authorities are held to', () => {
		expect(() =>
			parseAuthorityDeclarations(REPO_AUTHORITIES),
		).not.toThrow();
	});
});
