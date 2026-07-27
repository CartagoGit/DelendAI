import { describe, expect, it } from 'vitest';

import { FACADE_TOOLS, lintCompatWindow } from './compat-window.script';

const facadeFile = (name: string) =>
	`/abs/plugins/proposals/src/lib/tools/${name.replace(/_/g, '-')}.tool.ts`;
const nonFacadeFile = (name: string) =>
	`/abs/plugins/quality/src/lib/tools/${name}.tool.ts`;

describe('lintCompatWindow (f00152 S4)', () => {
	it('allows facade tools to import compat-window helpers', () => {
		const verdict = lintCompatWindow([
			{
				absPath: facadeFile('proposal_transition'),
				imports: ['./proposal-transition.compat'],
			},
		]);
		expect(verdict.ok).toBe(true);
	});

	it('rejects non-facade tools that import compat-window helpers', () => {
		const verdict = lintCompatWindow([
			{
				absPath: nonFacadeFile('quality_run'),
				imports: ['../contracts/compat-window'],
			},
		]);
		expect(verdict.ok).toBe(false);
		expect(verdict.violations).toHaveLength(1);
	});

	it('lists every facade tool (sanity check)', () => {
		expect(FACADE_TOOLS).toContain('proposal_transition');
		expect(FACADE_TOOLS).toContain('auto_work');
		expect(FACADE_TOOLS).toContain('state_repair');
		expect(FACADE_TOOLS.length).toBe(10);
	});

	it('returns ok on an empty file list', () => {
		const verdict = lintCompatWindow([]);
		expect(verdict.ok).toBe(true);
		expect(verdict.violations).toEqual([]);
	});
});
