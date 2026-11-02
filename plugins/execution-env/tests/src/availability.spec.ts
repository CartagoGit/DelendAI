/**
 * availability.spec.ts — the execution-env plugin says whether it can work here.
 */
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import plugin from '../../src/index';

type Context = Parameters<NonNullable<typeof plugin.availability>>[0];

const availability = (ctx: Context) => plugin.availability?.(ctx);

describe('execution-env availability', () => {
	it('is a library: other plugins build on it', async () => {
		const answer = await availability(
			fakePartial<Context>({ options: {} }),
		);
		expect(answer?.state).toBe('library');
	});

	it('registers no tools of its own', async () => {
		const served = await plugin.register(
			fakePartial<Context>({
				namespacePrefix: 'x',
				pluginCacheDir: '.cache/x',
				workspace: fakePartial<Context['workspace']>({
					root: '/w',
					resolve: (p: string) => `/w/${p}`,
				}),
				options: {},
			}),
		);
		expect(served.tools ?? []).toEqual([]);
	});
});
