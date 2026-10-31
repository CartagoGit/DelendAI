import { describe, expect, it } from 'vitest';

import { verifyAgainstContract } from '../../../../src/lib/verify/verify-against-contract.service';

const contract = {
	framework: { id: 'angular', version: '19.2.0' },
	style: {
		architecture: 'external-templates',
		tokens: [{ name: '--color-primary', value: '#0055ff' }],
	},
	placement: { profile: 'typescript' },
	from: ['framework-knowledge', 'style-convention', 'conventions'],
};

describe('verifyAgainstContract', () => {
	it('resolves every conflict to the project, naming what it overrode', () => {
		const findings = verifyAgainstContract({
			files: [
				{
					path: 'stray/button.scss',
					content: '.b { color: #0055FF; background: #fff; }',
				},
			],
			contract,
			roleOf: (path) =>
				path.startsWith('src/') ? 'component' : undefined,
			source: { framework: { id: 'angular', version: '20.0.0' } },
		});
		expect(findings.map((finding) => finding.kind)).toEqual([
			'placement',
			'design-token',
			'design-token',
			'framework-version',
		]);
		expect(
			findings.every((finding) => finding.resolvedTo === 'project'),
		).toBe(true);
		expect(findings[1]?.detail).toContain('--color-primary');
		expect(findings[3]?.overridden).toBe('angular 20.0.0');
	});

	it('finds nothing in a file that keeps to the contract, or with no contract', () => {
		const files = [
			{
				path: 'src/b.scss',
				content: '.b { color: var(--color-primary); }',
			},
		];
		expect(
			verifyAgainstContract({
				files,
				contract,
				roleOf: () => 'component',
			}),
		).toEqual([]);
		expect(
			verifyAgainstContract({ files, contract: { from: [] } }),
		).toEqual([]);
	});
});
