/**
 * availability.spec.ts — the audit-orchestrator plugin says whether it can work here.
 */
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import plugin from '../../src/index';

type Context = Parameters<NonNullable<typeof plugin.availability>>[0];

const availability = (ctx: Context) => plugin.availability?.(ctx);

describe('audit-orchestrator availability', () => {
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
						options: {},
						subagentRuntime: fakePartial<
							NonNullable<Context['subagentRuntime']>
						>({}),
					}),
				)
			)?.state,
		).toBe('registered');
	});

	it('registers its tools, and reports options it cannot use', async () => {
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
		const served = await register({});
		expect(served.tools?.length).toBeGreaterThan(0);
		const refused = await register({ allowFakeDispatchPort: 'yes' });
		expect(refused.tools).toEqual([]);
		expect(refused).toMatchObject({ errors: [expect.anything()] });
	});
});
