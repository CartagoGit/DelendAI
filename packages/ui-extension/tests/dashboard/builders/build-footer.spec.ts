import { describe, expect, it } from 'vitest';
import type { IDashboardAllModels } from '@delendai/client';
import { dictsByLang } from '@delendai/shared/i18n';
import { buildFooter } from '../../../src/dashboard/builders/build-footer';

describe('buildFooter', () => {
	it('renders footer templates correctly', () => {
		const mockModel = {
			server: {
				fetchedAt: '2026-06-28T19:00:00Z',
			},
		} as unknown as IDashboardAllModels;

		const options = {
			refreshCommand: 'delendai.refresh',
			docsUrl: 'https://delendai.dev',
		};

		const html = buildFooter(mockModel, options, dictsByLang.en);
		expect(html).toContain('delendai-footer');
		expect(html).toContain('delendai.refresh');
		expect(html).toContain('https://delendai.dev');
		expect(html).toContain('2026-06-28T19:00:00Z');
	});
});
