/**
 * availability.spec.ts — the agent-orchestrator plugin says whether it can work here.
 */
import { fakePartial } from '@delendai/test-kit';
import { createFakeToolServer } from '@delendai/test-kit/public';
import { describe, expect, it } from 'vitest';

import plugin from '../../src/index';

type Context = Parameters<NonNullable<typeof plugin.availability>>[0];

const availability = (ctx: Context) => plugin.availability?.(ctx);

describe('agent-orchestrator availability', () => {
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

	it('plans without a host runtime, and refuses to dispatch, as it says', async () => {
		const served = await plugin.register(
			fakePartial<Context>({ namespacePrefix: 'x', options: {} }),
		);
		const handlers: Record<string, (args: unknown) => Promise<unknown>> =
			{};
		for (const tool of served.tools ?? []) {
			await tool.register(
				createFakeToolServer({
					onRegisterTool: ({ name, handler }) => {
						handlers[name] = handler as (
							args: unknown,
						) => Promise<unknown>;
					},
				}),
			);
		}
		const refusal = await handlers.x_dispatch?.({
			task: { id: 't1', description: 'rename a variable', tags: [] },
		});
		expect(JSON.stringify(refusal)).toContain('subagent');
	});
});
