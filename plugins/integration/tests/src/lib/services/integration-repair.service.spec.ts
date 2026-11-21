/** integration-repair.service.spec.ts — a repair pass refuses early and, with a green tip, touches nothing. */
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import type { ILandCheck, ILandForge, ILandGit } from '@delendai/core/cli';
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:child_process')>()),
	execFileSync: (command: string): string =>
		command === 'mktemp' ? '/scratch\n' : '',
}));

import { runIntegrationRepair } from '../../../../src/lib/services/integration-repair.service';

const run = async (
	development: Record<string, unknown>,
	env: Record<string, string>,
	stdout = '[]',
	gitExec?: (cwd: string, args: readonly string[]) => string,
) => {
	const out: string[] = [];
	const code = await runIntegrationRepair({
		root: '/repo',
		policy: resolveDevelopmentPolicy({ development }),
		env,
		runGh: () => Promise.resolve({ exitCode: 0, stdout, stderr: '' }),
		log: (line) => out.push(line),
		error: (line) => out.push(line),
		ports: {
			forge: fakePartial<ILandForge>({
				integrationTip: () => Promise.resolve('r'),
			}),
			git: fakePartial<ILandGit>({}),
			...(gitExec === undefined ? {} : { gitExec }),
		},
	});
	return { code, out: out.join('\n') };
};

describe('runIntegrationRepair', () => {
	it('[<20ms] does nothing while the engine is not `land`', async () => {
		const { code, out } = await run({}, { GITHUB_REPOSITORY: 'o/n' });
		expect(code).toBe(0);
		expect(out).toContain('not `land`');
	});

	it('[<20ms] refuses without a repository or with a newer protocol', async () => {
		expect((await run({}, {})).code).toBe(2);
		const newer = await run(
			{ integration: { engine: 'land', protocol: 999 } },
			{ GITHUB_REPOSITORY: 'o/n' },
		);
		expect(newer.code).toBe(2);
	});

	it('[<20ms] reads the CI history and does nothing when the latest run is green', async () => {
		const { code, out } = await run(
			{ integration: { engine: 'land' } },
			{ GITHUB_REPOSITORY: 'o/n' },
			'[{"headSha":"r","conclusion":"success"}]',
		);
		expect(code).toBe(0);
		expect(out).toContain('nothing to do');
	});
});

describe('runIntegrationRepair known failures', () => {
	it('[<20ms] writes an empty note for the green commit', async () => {
		const calls: string[][] = [];
		await run(
			{ integration: { engine: 'land' } },
			{ GITHUB_REPOSITORY: 'o/n' },
			'[{"headSha":"r","conclusion":"success"}]',
			(_cwd, args) => {
				calls.push([...args]);
				return '';
			},
		);
		const add = calls.find((c) => c.includes('notes'));
		expect(add).toContain('[]');
		expect(add).toContain('r');
		expect(add?.some((a) => a.endsWith('/known-failing'))).toBe(true);
	});
});

describe('runIntegrationRepair on a red tip', () => {
	it('[<20ms] names the merge in the green..red range and opens its one revert', async () => {
		const opened: string[] = [];
		const out: string[] = [];
		const gitCalls: string[] = [];
		const forge = fakePartial<ILandForge>({
			integrationTip: () => Promise.resolve('r'),
			checks: () =>
				Promise.resolve<ILandCheck[]>([
					{
						name: 'tests: a',
						conclusion: 'failure',
						failingSpecs: ['a.spec.ts'],
					},
				]),
			openPullRequests: () => Promise.resolve([]),
			openPullRequest: ({ head }) => {
				opened.push(head);
				return Promise.resolve(901);
			},
			addLabel: () => Promise.resolve(),
			comments: () => Promise.resolve([]),
			comment: () => Promise.resolve(),
			pullRequest: () =>
				Promise.resolve({
					number: 5,
					headRef: 'h',
					headSha: 's',
					draft: false,
					state: 'closed',
					merged: true,
					labels: [],
					body: '',
					testedBase: 't',
				}),
		});
		const code = await runIntegrationRepair({
			root: '/repo',
			policy: resolveDevelopmentPolicy({
				development: {
					integration: {
						engine: 'land',
						requiredChecks: ['tests: a'],
						zones: ['a', 'b'],
					},
				},
			}),
			env: { GITHUB_REPOSITORY: 'o/n', GH_TOKEN: 't' },
			runGh: () =>
				Promise.resolve({
					exitCode: 0,
					stderr: '',
					stdout: '[{"headSha":"r","conclusion":"failure"},{"headSha":"g","conclusion":"success"}]',
				}),
			log: (line) => out.push(line),
			error: (line) => out.push(line),
			ports: {
				forge,
				git: fakePartial<ILandGit>({
					landedSince: () => ({
						files: new Set(['a.spec.ts']),
						zones: new Set(['a']),
					}),
				}),
				gitExec: (_cwd, args) => {
					gitCalls.push(args.join(' '));
					return args[0] === 'log'
						? 'm5\tMerge pull request #5 from x\nnoise\tnot a pull'
						: '';
				},
			},
		});
		expect(code).toBe(0);
		expect(opened).toEqual([expect.stringContaining('revert-5')]);
		expect(out.join('\n')).toContain('repair #901 opened');
		expect(gitCalls.some((c) => c.startsWith('log --first-parent'))).toBe(
			true,
		);
	});
});
