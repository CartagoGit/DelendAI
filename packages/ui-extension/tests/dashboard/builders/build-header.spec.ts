import { describe, expect, it } from 'vitest';
import type { IDashboardAllModels } from '@mcp-vertex/client';
import { buildHeader } from '../../../src/dashboard/builders/build-header';

describe('buildHeader', () => {
	it('renders the header correctly', () => {
		const mockModel = {
			server: {
				name: 'mcp-vertex-test',
				version: '1.2.3',
				fetchedAt: '2026-06-28T19:00:00Z',
			},
		} as unknown as IDashboardAllModels;

		const html = buildHeader(mockModel);
		expect(html).toContain('mcp-vertex-test');
		expect(html).toContain('1.2.3');
	});
});
