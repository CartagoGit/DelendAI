import { describe, expect, it } from 'vitest';

import { detectCliI18n, formatReport } from './cli-i18n.script';

describe('cli-i18n.script', async () => {
	it('keeps every declared CLI help locale complete', async () => {
		const report = await detectCliI18n();
		expect(report.langs).toEqual([
			'ar',
			'de',
			'en',
			'es',
			'fr',
			'hi',
			'it',
			'ja',
			'pt',
			'th',
			'vi',
			'zh',
		]);
		expect(report.commands).toContain('config doctor');
		expect(report.findings).toEqual([]);
	});

	it('formats the passing report as a concise gate line', async () => {
		expect(
			formatReport({ langs: ['en'], commands: ['status'], findings: [] }),
		).toBe('cli-i18n: 1 languages cover 1 commands.\n');
	});
});
