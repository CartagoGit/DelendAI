/** integration-pass.service.spec.ts — a pass refuses before it touches the forge. */
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it, vi } from 'vitest';

import type { IIntegrationPassInput } from '../../../../src/lib/contracts/interfaces/integration-pass.interface';
import { runIntegrationPass } from '../../../../src/lib/services/integration-pass.service';

const seen = vi.hoisted(() => ({ batches: [] as boolean[] }));
vi.mock('@delendai/core/cli', async (importOriginal) => ({
	...(await importOriginal<typeof import('@delendai/core/cli')>()),
	landPass: async (input: { config: { batches: boolean } }) => {
		seen.batches.push(input.config.batches);
		return {
			actions: [],
			reasons: new Map(),
			mergedCount: 0,
			mergedPRs: [],
			tipSha: 'abcdef1234567890',
		};
	},
}));

const run = async (
	development: Record<string, unknown>,
	env: Record<string, string>,
) => {
	const out: string[] = [];
	const code = await runIntegrationPass({
		root: '/repo',
		policy: resolveDevelopmentPolicy({ development }),
		env,
		runGh: () => Promise.reject(new Error('the forge was reached')),
		log: (line) => out.push(line),
		error: (line) => out.push(line),
	});
	return { code, out };
};

describe('runIntegrationPass', () => {
	it('[<20ms] does nothing while the engine is not `land`', async () => {
		const { code, out } = await run({}, { GITHUB_REPOSITORY: 'o/n' });
		expect(code).toBe(0);
		expect(out.join()).toContain('nothing to do');
	});

	it('[<20ms] refuses without a repository', async () => {
		const { code, out } = await run({}, {});
		expect(code).toBe(2);
		expect(out.join()).toContain('GITHUB_REPOSITORY');
	});

	it('[<20ms] refuses a repository that records a newer protocol', async () => {
		const { code } = await run(
			{ integration: { engine: 'land', protocol: 999 } },
			{ GITHUB_REPOSITORY: 'o/n' },
		);
		expect(code).toBe(2);
	});

	it('[<20ms] batches what overlaps when the policy says so, and only then', async () => {
		seen.batches.length = 0;
		const env = { GITHUB_REPOSITORY: 'o/n' };
		const ports = fakePartial<NonNullable<IIntegrationPassInput['ports']>>({
			forge: fakePartial<never>({}),
			git: fakePartial<never>({}),
			bringForward: fakePartial<never>({}),
		});
		const pass = async (batching: string) =>
			runIntegrationPass({
				root: '/repo',
				policy: resolveDevelopmentPolicy({
					development: { integration: { engine: 'land', batching } },
				}),
				env,
				runGh: () => Promise.reject(new Error('the forge was reached')),
				log: () => undefined,
				error: () => undefined,
				ports,
			});
		await pass('overlap');
		await pass('off');
		expect(seen.batches).toEqual([true, false]);
	});
});
