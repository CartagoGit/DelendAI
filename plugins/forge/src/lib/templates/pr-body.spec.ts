import { describe, expect, it } from 'vitest';

import { renderPrBody, renderPrSubject } from './pr-body';

describe('renderPrBody', () => {
	it('renders a feat subject from a feat proposal id', () => {
		expect(renderPrSubject('Add forge write surface', 'f00121')).toBe(
			'feat: Add forge write surface',
		);
	});

	it('renders a fix subject from a fix branch prefix', () => {
		expect(
			renderPrSubject(
				'Repair forge parser',
				undefined,
				'fix/forge-parser',
			),
		).toBe('fix(forge): Repair forge parser');
	});

	it('renders a chore subject from a chore proposal id', () => {
		expect(renderPrSubject('Tighten lint gate', 'c00012')).toBe(
			'chore: Tighten lint gate',
		);
	});

	it('includes summary, context and commits', () => {
		const out = renderPrBody({
			title: 'Add forge write surface',
			body: 'Implements the consented write path.',
			proposalId: 'f00121',
			branch: 'feat/forge-write-surface',
			base: 'develop',
			commits: [
				{ sha: 'abc1234567', subject: 'feat: wire forge write tool' },
				{ sha: 'def9876543', subject: 'test: cover confirm gate' },
			],
		});
		expect(out).toContain('feat(forge): Add forge write surface');
		expect(out).toContain('- Branch: feat/forge-write-surface');
		expect(out).toContain('- Proposal: f00121');
		expect(out).toContain('- abc1234 feat: wire forge write tool');
		expect(out).toContain('- def9876 test: cover confirm gate');
	});

	it('falls back when optional fields are missing', () => {
		const out = renderPrBody({
			title: 'Add forge write surface',
			commits: [],
		});
		expect(out).toContain('No additional context provided.');
		expect(out).toContain('- Proposal: none linked');
		expect(out).not.toContain('## Commits');
	});
});
