import { describe, expect, it } from 'vitest';

import { lintNoManualPluginPageDuplicate } from './no-manual-plugin-page-duplicate.script';

describe('no-manual-plugin-page-duplicate lint', () => {
	it('passes when a plugin has no manual page at all', () => {
		const result = lintNoManualPluginPageDuplicate({
			generatedIds: new Set(['search']),
			manualPages: {},
		});
		expect(result).toEqual({ ok: true, violations: [] });
	});

	it('passes when the manual page is a short redirect stub', () => {
		const result = lintNoManualPluginPageDuplicate({
			generatedIds: new Set(['context-for-change']),
			manualPages: {
				'context-for-change': [
					'> **Merged (d00014).** This page moved into',
					'> auto-generated/context-for-change.md.',
				].join('\n'),
			},
		});
		expect(result).toEqual({ ok: true, violations: [] });
	});

	it('passes when the manual page id has no auto-generated counterpart (not a plugin id)', () => {
		const result = lintNoManualPluginPageDuplicate({
			generatedIds: new Set(['search']),
			manualPages: {
				'unrelated-notice': '# Some unrelated top-level notice\n',
			},
		});
		expect(result).toEqual({ ok: true, violations: [] });
	});

	it('fails when a manual page duplicates real content for a plugin with an auto-generated page', () => {
		const result = lintNoManualPluginPageDuplicate({
			generatedIds: new Set(['error-reporting']),
			manualPages: {
				'error-reporting': [
					'# Error Reporting',
					'',
					'## Reporting policy',
					'',
					'External project data is non-reportable by construction.',
				].join('\n'),
			},
		});
		expect(result.ok).toBe(false);
		expect(result.violations[0]).toContain('error-reporting.md duplicates');
	});

	it('fails when the redirect stub grows past the size a redirect should ever need', () => {
		const bloated = [
			'> **Merged (d00014).**',
			...Array.from({ length: 10 }, (_, i) => `line ${i}`),
		].join('\n');
		const result = lintNoManualPluginPageDuplicate({
			generatedIds: new Set(['impact-analysis']),
			manualPages: { 'impact-analysis': bloated },
		});
		expect(result.ok).toBe(false);
	});
});
