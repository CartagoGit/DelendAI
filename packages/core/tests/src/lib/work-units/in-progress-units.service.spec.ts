/**
 * in-progress-units.service.spec.ts — a proposal in progress is
 * somebody's unit, here or on the forge.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import {
	inProgressProposals,
	strandedProposalsInvariant,
} from '@delendai/core/lib/work-units/in-progress-units.service';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

describe('inProgressProposals', () => {
	it('reads the ids of the proposals under in-progress/ only', () => {
		expect(
			inProgressProposals([
				'docs/delendai/proposals/in-progress/f00761-a-plugin.md',
				'docs/delendai/proposals/in-progress/.gitkeep',
				'docs/delendai/proposals/review/x00893-hooks.md',
				'packages/core/src/index.ts',
			]),
		).toEqual(['f00761']);
	});
});

describe('strandedProposalsInvariant', () => {
	it('holds when each proposal in progress has a work or publication branch', () => {
		const result = strandedProposalsInvariant({
			policy,
			inProgress: ['f00761', 'x00898'],
			branches: [
				'delendai/wip/claude-opus-5-5/implement/f00761-all-g1/plugin-in-any-language',
				'delendai/pr/claude-opus-5-5/create/x00898-all-g1/stranded',
				'develop',
			],
		});
		expect(result).toMatchObject({ holds: true, observed: 'all held' });
	});

	it('names a proposal in progress that no branch holds', () => {
		const result = strandedProposalsInvariant({
			policy,
			inProgress: ['x00893', 'f00761', 'x00893'],
			branches: [
				'delendai/wip/claude-opus-5-5/implement/f00761-all-g1/plugin-in-any-language',
			],
		});
		expect(result.holds).toBe(false);
		expect(result.id).toBe('in-progress-has-units');
		expect(result.observed).toBe('1 with no unit: x00893');
		expect(result.remedy).toContain('work enter');
	});
});
