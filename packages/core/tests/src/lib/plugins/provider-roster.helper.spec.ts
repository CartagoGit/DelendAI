import { describe, expect, it } from 'vitest';

import { validProviderRoster } from '../../../../src/lib/plugins/provider-roster.helper';

const provider = (id: string) => ({
	id,
	kind: 'cli',
	invoke: { kind: 'cli', command: id },
	modelId: `${id}-model`,
	contextWindow: 200_000,
	costTier: 3,
	strengths: [],
	weaknesses: [],
});

describe('validProviderRoster', () => {
	it('is empty when the configuration declares no roster', () => {
		expect(validProviderRoster(undefined)).toEqual({
			providers: [],
			rejected: [],
		});
	});

	it('keeps the valid entries in order and names each one it leaves out', () => {
		const roster = validProviderRoster([
			provider('alpha'),
			{ ...provider('beta'), costTier: 9 },
			provider('alpha'),
			'not an entry',
			provider('gamma'),
		]);
		expect(roster.providers.map((entry) => entry.id)).toEqual([
			'alpha',
			'gamma',
		]);
		expect(roster.rejected.map((entry) => [entry.index, entry.id])).toEqual(
			[
				[1, 'beta'],
				[2, 'alpha'],
				[3, undefined],
			],
		);
		expect(roster.rejected[1]?.reason).toContain('duplicate');
	});
});
