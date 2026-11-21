/** integration-pass.service.spec.ts — a pass refuses before it touches the forge. */
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import type { ILandDeps, ILandForge, ILandGit } from '@delendai/core/cli';
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it, vi } from 'vitest';

import type { IIntegrationPassInput } from '../../../../src/lib/contracts/interfaces/integration-pass.interface';
import { runIntegrationPass } from '../../../../src/lib/services/integration-pass.service';

const seen = vi.hoisted(() => ({
	batches: [] as boolean[],
	gone: undefined as string | undefined,
	actions: [] as string[],
}));
vi.mock('@delendai/core/cli', async (importOriginal) => ({
	...(await importOriginal<typeof import('@delendai/core/cli')>()),
	landPass: async (input: { config: { batches: boolean } }) => {
		seen.batches.push(input.config.batches);
		if (seen.gone !== undefined)
			throw new (
				await importOriginal<typeof import('@delendai/core/cli')>()
			).LandBranchGoneError(seen.gone);
		return {
			actions: seen.actions,
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
			forge: fakePartial<ILandForge>({}),
			git: fakePartial<ILandGit>({}),
			bringForward: fakePartial<ILandDeps['bringForward']>({}),
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

	it('[<20ms] ends without failing when the integration branch it was woken for is gone', async () => {
		seen.gone = 'rehearsal/r1/s-integration';
		const out: string[] = [];
		const code = await runIntegrationPass({
			root: '/repo',
			policy: resolveDevelopmentPolicy({
				development: { integration: { engine: 'land' } },
			}),
			env: { GITHUB_REPOSITORY: 'o/n' },
			runGh: () => Promise.reject(new Error('the forge was reached')),
			log: (line) => out.push(line),
			error: (line) => out.push(`error ${line}`),
			ports: fakePartial<NonNullable<IIntegrationPassInput['ports']>>({
				forge: fakePartial<ILandForge>({}),
				git: fakePartial<ILandGit>({}),
				bringForward: fakePartial<ILandDeps['bringForward']>({}),
			}),
		});
		seen.gone = undefined;
		expect(code).toBe(0);
		expect(out.join()).toContain('no longer exists; nothing to settle');
		expect(out.join()).not.toContain('error');
	});
});

describe('the watchdog evidence', () => {
	const watch = async (env: Record<string, string>) => {
		const files = new Map<string, string>();
		const code = await runIntegrationPass({
			root: '/repo',
			policy: resolveDevelopmentPolicy({
				development: { integration: { engine: 'land' } },
			}),
			env: { GITHUB_REPOSITORY: 'o/n', ...env },
			runGh: () => Promise.reject(new Error('the forge was reached')),
			log: () => undefined,
			error: () => undefined,
			ports: fakePartial<NonNullable<IIntegrationPassInput['ports']>>({
				forge: fakePartial<ILandForge>({}),
				git: fakePartial<ILandGit>({}),
				bringForward: fakePartial<ILandDeps['bringForward']>({}),
				writeEvidence: (path: string, text: string) => {
					files.set(path, text);
				},
			}),
		});
		return { code, files };
	};

	it('[<20ms] names the trigger, the commit and the pull request the pass acted on', async () => {
		seen.actions = ['merged #3022'];
		const { code, files } = await watch({
			LAND_WATCHDOG: '1',
			LAND_WATCHDOG_EVIDENCE: '/e.md',
			GITHUB_EVENT_NAME: 'schedule',
			GITHUB_SHA: 'abc123',
		});
		expect(code).toBe(1);
		const text = files.get('/e.md') ?? '';
		expect(text).toContain('Trigger: schedule');
		expect(text).toContain('Commit: abc123');
		expect(text).toContain('merged #3022');
	});

	it('[<20ms] writes nothing and succeeds when the pass found nothing to do', async () => {
		seen.actions = [];
		const { code, files } = await watch({
			LAND_WATCHDOG: '1',
			LAND_WATCHDOG_EVIDENCE: '/e.md',
		});
		expect(code).toBe(0);
		expect(files.size).toBe(0);
	});

	it('[<20ms] is not strict outside the watchdog', async () => {
		seen.actions = ['merged #1'];
		const { code, files } = await watch({
			LAND_WATCHDOG_EVIDENCE: '/e.md',
		});
		expect(code).toBe(0);
		expect(files.size).toBe(0);
	});
});
