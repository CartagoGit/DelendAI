import { describe, expect, it } from 'vitest';

import { analyzeIssue, kindForCategory } from '../src/lib/analysis.helper';

describe('analyzeIssue', () => {
	it('classifies a crash as a high-severity bug', () => {
		const result = analyzeIssue(
			'App crashes on boot',
			'Every launch throws an exception and breaks',
		);
		expect(result.category).toBe('bug');
		expect(result.severity).toBe('high');
		expect(result.keywords).toContain('crash');
	});

	it('classifies a data-loss report as critical', () => {
		const result = analyzeIssue(
			'Proposals cause data loss',
			'It corrupts the index and loses history',
		);
		expect(result.category).toBe('bug');
		expect(result.severity).toBe('critical');
	});

	it('classifies a feature request', () => {
		const result = analyzeIssue(
			'Add webhooks support',
			'It would be nice to support webhooks',
		);
		expect(result.category).toBe('feature');
		expect(result.severity).toBe('low');
	});

	it('falls back to other with no keywords', () => {
		const result = analyzeIssue('zzz', 'qqq');
		expect(result.category).toBe('other');
		expect(result.severity).toBe('low');
	});
});

describe('kindForCategory', () => {
	it('maps categories to proposal kinds', () => {
		expect(kindForCategory('bug')).toBe('fix');
		expect(kindForCategory('feature')).toBe('feat');
		expect(kindForCategory('docs')).toBe('docs');
		expect(kindForCategory('question')).toBe('chore');
	});
});
