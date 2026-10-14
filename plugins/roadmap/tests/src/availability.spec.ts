/**
 * availability.spec.ts — the roadmap plugin says whether it can work here.
 */
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import plugin from '../../src/index';

type Context = Parameters<NonNullable<typeof plugin.availability>>[0];

const availability = (ctx: Context) => plugin.availability?.(ctx);

describe('roadmap availability', () => {
	it('says what it is missing when it cannot work', async () => {
		const answer = await availability(
			fakePartial<Context>({ options: {} }),
		);
		expect(answer?.state).toBe('needs-configuration');
		expect(answer?.missing).toBeDefined();
		expect(answer?.fix).toBeDefined();
	});

	it('is registered once it has what it needs', async () => {
		expect(
			(
				await availability(
					fakePartial<Context>({ options: { file: 'ROADMAP.md' } }),
				)
			)?.state,
		).toBe('registered');
	});
});
