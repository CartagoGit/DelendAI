import { describe, expect, it } from 'vitest';

import { renderIssueBody } from './issue-body';

describe('renderIssueBody', () => {
	it('renders the title, description and linked proposal', () => {
		const out = renderIssueBody({
			title: 'Track forge write surface',
			description: 'Create the consented remote write operations.',
			proposalId: 'f00121',
			labels: ['forge', 'plugin'],
		});
		expect(out).toContain('# Track forge write surface');
		expect(out).toContain('Create the consented remote write operations.');
		expect(out).toContain('- Linked proposal: f00121');
		expect(out).toContain('- Labels: forge, plugin');
	});

	it('renders a fallback when labels are absent', () => {
		const out = renderIssueBody({
			title: 'Track forge write surface',
			description: 'Body',
		});
		expect(out).toContain('- Labels: none');
		expect(out).toContain('- Linked proposal: none linked');
	});

	it('renders a fallback when description is absent', () => {
		const out = renderIssueBody({
			title: 'Track forge write surface',
			labels: ['forge'],
		});
		expect(out).toContain('No additional context provided.');
	});
});
