import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@mcp-vertex/core/public';

import {
	DEFAULT_CONVENTION,
	mergeConvention,
	renderCoverageMarkdown,
	renderOverviewMarkdown,
	renderRunnersMarkdown,
} from '@mcp-vertex/test-convention/public';

const reader: IFileReader = {
	readFile: async () => undefined,
	exists: async () => false,
	listDir: async () => [],
};

describe('renderOverviewMarkdown', async () => {
	it('mentions the spec extension and layout', async () => {
		const md = renderOverviewMarkdown(DEFAULT_CONVENTION);
		expect(md).toContain('.spec.ts');
		expect(md).toContain('colocate');
	});

	it('reflects a custom layout override', async () => {
		const c = mergeConvention({ specLayout: 'tests-mirror' });
		const md = renderOverviewMarkdown(c);
		expect(md).toContain('tests-mirror');
	});

	it('lists all forbidden patterns', async () => {
		const md = renderOverviewMarkdown(DEFAULT_CONVENTION);
		for (const p of DEFAULT_CONVENTION.forbiddenPatterns) {
			expect(md).toContain(p.source);
		}
	});

	it('renders the coverage thresholds', async () => {
		const md = renderOverviewMarkdown(DEFAULT_CONVENTION);
		expect(md).toContain('80%');
		expect(md).toContain('70%');
	});
});

describe('renderRunnersMarkdown', async () => {
	it('names the runner and mock API', async () => {
		const md = renderRunnersMarkdown(reader, {
			name: 'vitest',
			mockApi: 'vi',
			evidence: 'vitest.config.ts',
		});
		expect(md).toContain('vitest');
		expect(md).toContain('vi');
		expect(md).toContain('vitest.config.ts');
	});
});

describe('renderCoverageMarkdown', async () => {
	it('renders a markdown table with the four thresholds', async () => {
		const md = renderCoverageMarkdown(DEFAULT_CONVENTION);
		expect(md).toContain('| Metric');
		expect(md).toContain('lines');
		expect(md).toContain('functions');
		expect(md).toContain('branches');
		expect(md).toContain('statements');
	});

	it('documents the per-project override shape', async () => {
		const md = renderCoverageMarkdown(DEFAULT_CONVENTION);
		expect(md).toContain('coverageThreshold');
		expect(md).toContain('mcp-vertex.config.json');
	});
});
