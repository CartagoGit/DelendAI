import { describe, expect, it } from 'vitest';
import type { IDashboardAllModels } from '@mcp-vertex/client';
import { dictsByLang } from '@mcp-vertex/shared/i18n';
import { buildFooter } from '../../../src/dashboard/builders/build-footer';

describe('buildFooter', () => {
	it('renders footer templates correctly', () => {
		const mockModel = {
			server: {
				fetchedAt: '2026-06-28T19:00:00Z',
			},
		} as unknown as IDashboardAllModels;

		const options = {
			refreshCommand: 'mcp-vertex.refresh',
			docsUrl: 'https://docs.mcp.vertex',
		};

		const html = buildFooter(mockModel, options, dictsByLang.en);
		expect(html).toContain('mv-footer');
		expect(html).toContain('mcp-vertex.refresh');
		expect(html).toContain('https://docs.mcp.vertex');
		expect(html).toContain('2026-06-28T19:00:00Z');
	});
});
