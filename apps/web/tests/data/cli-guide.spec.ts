import { describe, expect, it } from 'vitest';

import { CLI_GUIDE } from '#DATA/cli-guide';
import { PLUGIN_SLUGS } from '#DATA/plugin-catalog';

/**
 * f00053 S5 — the CLI guide data covers the documented command groups
 * and has no empty sections.
 */
describe('CLI_GUIDE', () => {
	it('has a binary, global flags, command groups and workflows (no empty section)', () => {
		expect(CLI_GUIDE.binary.length).toBeGreaterThan(0);
		expect(CLI_GUIDE.globalFlags.length).toBeGreaterThan(0);
		expect(CLI_GUIDE.commandGroups.length).toBeGreaterThan(0);
		expect(CLI_GUIDE.workflows.length).toBeGreaterThan(0);
	});

	it('every global flag has a flag token and a summary', () => {
		for (const flag of CLI_GUIDE.globalFlags) {
			expect(flag.flag.startsWith('--')).toBe(true);
			expect(flag.summary.length).toBeGreaterThan(0);
		}
	});

	it('documents a command group for every shipped plugin, plus core + doctor', () => {
		const ids = new Set(CLI_GUIDE.commandGroups.map((g) => g.id));
		for (const slug of PLUGIN_SLUGS) {
			expect(ids.has(slug), `missing CLI command group for ${slug}`).toBe(
				true,
			);
		}
		expect(ids.has('core')).toBe(true);
		expect(ids.has('doctor')).toBe(true);
	});

	it('every command group has a non-empty title and summary', () => {
		for (const group of CLI_GUIDE.commandGroups) {
			expect(group.title.length).toBeGreaterThan(0);
			expect(group.summary.length).toBeGreaterThan(0);
		}
	});

	it('every workflow has a title and at least one step', () => {
		for (const flow of CLI_GUIDE.workflows) {
			expect(flow.title.length).toBeGreaterThan(0);
			expect(flow.steps.length).toBeGreaterThan(0);
			for (const step of flow.steps) {
				expect(step.length).toBeGreaterThan(0);
			}
		}
	});
});
