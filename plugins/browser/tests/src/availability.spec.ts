/**
 * availability.spec.ts — the browser plugin says whether it can work here.
 */
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import plugin from '../../src/index';

type Context = Parameters<NonNullable<typeof plugin.availability>>[0];

const noop = (): undefined => undefined;

const availability = (ctx: Context) => plugin.availability?.(ctx);

describe('browser availability', () => {
	it('says what it is missing when it cannot work', async () => {
		const answer = await availability(
			fakePartial<Context>({ options: {} }),
		);
		expect(answer?.state).toBe('needs-host-adapter');
		expect(answer?.missing).toBeDefined();
		expect(answer?.fix).toBeDefined();
	});

	it('is registered once it has what it needs', async () => {
		expect(
			(
				await availability(
					fakePartial<Context>({
						options: {
							driver: {
								navigate: noop,
								screenshot: noop,
								query: noop,
								click: noop,
								fill: noop,
								assert: noop,
								runAxe: noop,
							},
						},
					}),
				)
			)?.state,
		).toBe('registered');
	});

	it('registers its tools with or without a driver, and refuses bad options', async () => {
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
		const bare = await register({});
		expect(bare.tools?.length).toBeGreaterThan(0);
		const driven = await register({
			driver: {
				navigate: noop,
				screenshot: noop,
				query: noop,
				click: noop,
				fill: noop,
				assert: noop,
				runAxe: noop,
			},
		});
		expect(driven.tools?.length).toBe(bare.tools?.length);
		expect(() => register({ pluginCacheDir: 3 })).toThrow(
			/rejected its options/u,
		);
	});
});
