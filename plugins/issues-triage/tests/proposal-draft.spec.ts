import { describe, expect, it } from 'vitest';

import { analyzeIssue } from '../src/lib/analysis.helper';
import { buildProposalDraft } from '../src/lib/proposal-draft.builder';

const base = {
	id: 'x00123',
	issueNumber: 7,
	issueUrl: 'https://github.com/o/r/issues/7',
	repo: 'o/r',
	title: 'Crash on boot',
	body: 'It crashes with an exception.',
	date: '2026-08-24',
};

describe('buildProposalDraft', () => {
	it('renders a lint-valid frontmatter for a bug', () => {
		const draft = buildProposalDraft({
			...base,
			analysis: analyzeIssue(base.title, base.body),
		});
		expect(draft.startsWith('---\n')).toBe(true);
		expect(draft).toContain('id: x00123');
		expect(draft).toContain('kind: fix');
		expect(draft).toContain('status: ready');
		expect(draft).toContain('track: github');
		expect(draft).toContain('## Goal');
		expect(draft).toContain('## Slices');
		expect(draft).toContain('o/r#7');
	});

	it('maps a feature request to kind feat', () => {
		const draft = buildProposalDraft({
			...base,
			title: 'Add webhooks support',
			body: 'Feature request for webhooks',
			analysis: analyzeIssue(
				'Add webhooks support',
				'Feature request for webhooks',
			),
		});
		expect(draft).toContain('kind: feat');
	});

	it('embeds the issue body verbatim', () => {
		const draft = buildProposalDraft({
			...base,
			analysis: analyzeIssue(base.title, base.body),
		});
		expect(draft).toContain('It crashes with an exception.');
	});
});
