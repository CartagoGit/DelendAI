/**
 * availability.spec.ts — the style-convention plugin says whether it can work here.
 */
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import plugin from '../../src/index';

type Context = Parameters<NonNullable<typeof plugin.availability>>[0];

const availability = (ctx: Context) => plugin.availability?.(ctx);

describe('style-convention availability', () => {
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
					fakePartial<Context>({
						options: { styleRoots: ['src/styles'] },
					}),
				)
			)?.state,
		).toBe('registered');
	});

	it('serves no tools until a stylesheet root is declared, then three', async () => {
		const register = (options: Record<string, unknown>) =>
			plugin.register(
				fakePartial<Context>({
					namespacePrefix: 'x',
					pluginCacheDir: '.cache/x',
					workspace: fakePartial<Context['workspace']>({
						root: '/w',
						resolve: (p: string) => `/w/${p}`,
					}),
					options,
				}),
			);
		expect((await register({})).tools).toEqual([]);
		const served = await register({ styleRoots: ['src/styles'] });
		expect(served.tools).toHaveLength(3);
		expect(() => register({ styleRoots: 'nope' })).toThrow(
			/rejected its options/u,
		);
	});
});
