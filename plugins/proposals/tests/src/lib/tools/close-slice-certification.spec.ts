/**
 * close-slice-certification.spec.ts — who certifies a slice's tree is the
 * project's configured landing route, and only an exactly equal tree is
 * evidence. The ports are the only fake: git, gh and the disk are the
 * questions asked, and every answer here is one they can really give.
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

import type { ICertificationPorts } from '@delendai/proposals/lib/contracts/interfaces/close-slice-gate.interface';
import { createCertificationReader } from '@delendai/proposals/lib/tools/close-slice-certification';

const TREE = 'a'.repeat(40);
const OTHER_TREE = 'b'.repeat(40);
const HEAD = '1'.repeat(40);
const PR_HEAD = '2'.repeat(40);

const policy = (
	integration: Partial<IResolvedDevelopmentPolicy['integration']>,
): IResolvedDevelopmentPolicy =>
	fakePartial<IResolvedDevelopmentPolicy, 'integration'>({
		integration: fakePartial<
			IResolvedDevelopmentPolicy['integration'],
			'requiresPullRequest' | 'strategy' | 'requiredChecks'
		>({
			requiresPullRequest: false,
			strategy: 'merge',
			requiredChecks: [],
			...integration,
		}),
	});

const pullRequest = policy({
	requiresPullRequest: true,
	strategy: 'pull-request',
	requiredChecks: ['delendai-validate'],
});

interface IForge {
	/** commit -> tree the repository holds for it. */
	readonly trees?: Readonly<Record<string, string>>;
	/** commit -> check-run rows (name, status, conclusion, url). */
	readonly checks?: Readonly<Record<string, readonly string[]>>;
	readonly pullRequestHeads?: readonly string[];
	readonly gh?: boolean;
	readonly files?: Readonly<Record<string, string>>;
}

const portsFor = (forge: IForge): ICertificationPorts => ({
	git: (args) => {
		if (args[0] === 'rev-parse' && args.includes('--git-common-dir')) {
			return '/repo/.git';
		}
		if (args[0] === 'rev-parse' && args.at(-1) === 'HEAD') return HEAD;
		const wanted = args.at(-1)?.replace(/\^\{tree\}$/u, '') ?? '';
		return forge.trees?.[wanted];
	},
	gh: (args) => {
		if (forge.gh === false) return undefined;
		if (args[0] === '--version') return 'gh version 2';
		if (args[0] === 'pr') return (forge.pullRequestHeads ?? []).join('\n');
		const sha = /commits\/([0-9a-f]+)\/check-runs/u.exec(
			args[1] ?? '',
		)?.[1];
		const rows = sha === undefined ? undefined : forge.checks?.[sha];
		return rows?.join('\n');
	},
	readFile: async (path) => forge.files?.[path],
});

const read = (
	forge: IForge,
	route: IResolvedDevelopmentPolicy | undefined = pullRequest,
	tree = TREE,
) => createCertificationReader({ policy: route, ports: portsFor(forge) })(tree);

const GREEN = 'delendai-validate\tcompleted\tsuccess\thttps://ci/1';

describe('pull-request route', () => {
	it('is certified by a green required check on a commit with the same tree', async () => {
		const verdict = await read({
			trees: { [HEAD]: OTHER_TREE, [PR_HEAD]: TREE },
			pullRequestHeads: [PR_HEAD],
			checks: { [PR_HEAD]: [GREEN] },
		});

		expect(verdict).toMatchObject({
			state: 'certified',
			source: 'forge-check',
		});
		expect(verdict.state === 'certified' && verdict.evidence).toContain(
			'delendai-validate',
		);
	});

	it('takes no evidence from a green commit whose tree differs', async () => {
		const verdict = await read({
			trees: { [HEAD]: OTHER_TREE, [PR_HEAD]: OTHER_TREE },
			pullRequestHeads: [PR_HEAD],
			checks: { [PR_HEAD]: [GREEN], [HEAD]: [GREEN] },
		});

		expect(verdict.state).toBe('none');
		expect(verdict.state === 'none' && verdict.missing.join(' ')).toContain(
			'no pushed commit has tree',
		);
		expect(verdict.state === 'none' && verdict.nextAction).toContain(
			'work publish',
		);
	});

	it('blocks on a red required check and names it', async () => {
		const verdict = await read({
			trees: { [HEAD]: TREE },
			checks: {
				[HEAD]: ['delendai-validate\tcompleted\tfailure\thttps://ci/9'],
			},
		});

		expect(verdict).toMatchObject({
			state: 'failed',
			check: 'delendai-validate',
		});
		expect(verdict.state === 'failed' && verdict.evidence).toContain(
			'https://ci/9',
		);
	});

	it('does not certify while a required check is still running or has not reported', async () => {
		const running = await read({
			trees: { [HEAD]: TREE },
			checks: { [HEAD]: ['delendai-validate\tin_progress\t\t'] },
		});
		const silent = await read({
			trees: { [HEAD]: TREE },
			checks: { [HEAD]: ['lint\tcompleted\tsuccess\t'] },
		});

		expect(running.state).toBe('none');
		expect(running.state === 'none' && running.missing[0]).toContain(
			'still in_progress',
		);
		expect(silent.state).toBe('none');
		expect(silent.state === 'none' && silent.missing[0]).toContain(
			'has not reported',
		);
	});

	it('needs every required check, not one of them', async () => {
		const verdict = await read(
			{ trees: { [HEAD]: TREE }, checks: { [HEAD]: [GREEN] } },
			policy({
				requiresPullRequest: true,
				strategy: 'pull-request',
				requiredChecks: ['delendai-validate', 'release-pr-gate'],
			}),
		);

		expect(verdict.state).toBe('none');
	});

	it('certifies nothing when the policy names no required check or gh is missing', async () => {
		const unnamed = await read(
			{ trees: { [HEAD]: TREE }, checks: { [HEAD]: [GREEN] } },
			policy({ requiresPullRequest: true, requiredChecks: [] }),
		);
		const noGh = await read({ trees: { [HEAD]: TREE }, gh: false });

		expect(unnamed.state).toBe('none');
		expect(noGh.state).toBe('none');
		expect(noGh.state === 'none' && noGh.missing[0]).toContain('gh');
	});
});

describe('merge route', () => {
	const record = (tree: string, extra: object = {}) => ({
		[`/repo/.git/delendai-certify/passed/${tree}.json`]: JSON.stringify({
			tree,
			candidateSha: 'c'.repeat(40),
			integrationSha: 'd'.repeat(40),
			...extra,
		}),
	});

	it('is certified by the local certification recorded when the unit landed', async () => {
		const verdict = await read({ files: record(TREE) }, policy({}));

		expect(verdict).toMatchObject({
			state: 'certified',
			source: 'landing-certification',
		});
	});

	it('accepts the covered unit tree and nothing else', async () => {
		const covered = await read(
			{ files: record(TREE, { tree: OTHER_TREE, coveredTree: TREE }) },
			policy({}),
		);
		const other = await read({ files: record(OTHER_TREE) }, policy({}));

		expect(covered.state).toBe('certified');
		expect(other.state).toBe('none');
		expect(other.state === 'none' && other.nextAction).toContain(
			'work publish',
		);
	});

	it('does not trust a record that says it certified a different tree', async () => {
		const verdict = await read(
			{ files: record(TREE, { tree: OTHER_TREE }) },
			policy({}),
		);

		expect(verdict.state).toBe('none');
	});
});

describe('no route to ask', () => {
	it('answers none for a direct profile and for no policy at all', async () => {
		const direct = await read({}, policy({ strategy: 'direct' }));
		const undeclared = await read({}, undefined);

		expect(direct.state).toBe('none');
		expect(undeclared.state).toBe('none');
	});
});
