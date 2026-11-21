/**
 * create-proposal.tool.spec.ts — the create_proposal handler: where it
 * writes, what it refuses, and the publication step it names.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFakeToolServer, fakePartial } from '@delendai/test-kit';

import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

import type { IToolRegistration } from '@delendai/core/contracts';

import type { IAuthoringToolOptions } from '@delendai/proposals/lib/tools/authoring.tool';
import {
	buildCreateProposalRegistration,
	scaffoldGaps,
} from '@delendai/proposals/lib/tools/authoring/create-proposal.tool';

type IHandler = (args: unknown) => Promise<{
	content: Array<{ text: string }>;
	isError?: boolean;
}>;

const capture = async (registration: IToolRegistration): Promise<IHandler> => {
	let handler: IHandler | undefined;
	await registration.register(
		createFakeToolServer({
			onRegisterTool: ({ handler: registered }) => {
				handler = registered as IHandler;
			},
		}),
	);
	if (handler === undefined)
		throw new Error('create_proposal not registered');
	return handler;
};

const _parse = (result: { content: Array<{ text: string }> }) =>
	JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;

describe('create_proposal', () => {
	let root = '';
	let options: IAuthoringToolOptions;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'create-proposal-'));
		options = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: join(root, 'docs/delendai/proposals'),
			indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
			runValidation: async () => ({
				ok: true,
				output: 'ok',
				exitCode: 0,
			}),
			requirePeerReview: false,
		};
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const proposal = {
		id: 'f00001',
		title: 'Create me',
		goal: 'A goal.',
		why: 'A reason.',
		nonGoals: ['Nothing else.'],
		slices: [
			{ sliceId: 'S1', files: ['src/a.ts'], acceptance: ['It works'] },
		],
	};

	it('[<200ms] refuses a checkout that is not a working tree of the repository', async () => {
		const create = await capture(buildCreateProposalRegistration(options));
		const refused = await create({
			...proposal,
			checkout: join(root, 'not-a-checkout'),
		});
		expect(refused.isError).toBe(true);
	});

	it('[<200ms] create_proposal refuses a checkout owned by another unit, naming it and work enter', async () => {
		const git = (cwd: string, ...args: string[]) =>
			execFileSync(
				'git',
				['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
				{ cwd, stdio: 'ignore' },
			);
		git(root, 'init', '-q', '-b', 'develop');
		writeFileSync(join(root, 'a.txt'), 'a');
		git(root, 'add', '.');
		git(root, 'commit', '-qm', 'init');
		const unit = 'delendai/wip/agent-a/implement/x00001-S1-g1/topic';
		const tree = join(root, 'unit-tree');
		git(root, 'worktree', 'add', '-q', '-b', unit, tree);
		const create = await capture(
			buildCreateProposalRegistration({
				...options,
				developmentPolicy: fakePartial<IResolvedDevelopmentPolicy>({
					branches: fakePartial<
						IResolvedDevelopmentPolicy['branches']
					>({
						integration: 'develop',
						namespacePrefix: 'delendai',
						workRefPrefix: 'delendai/wip/',
						workRefTemplate:
							'delendai/wip/${agent}/${kind}/${proposal}-${slice}-g${generation}/${topic}',
					}),
				}),
			}),
		);
		const refused = await create({ ...proposal, checkout: tree });
		expect(refused.isError).toBe(true);
		expect(refused.content[0]?.text).toContain(unit);
		expect(refused.content[0]?.text).toContain('work enter');
	});

	it('[<200ms] refuses a document it cannot write', async () => {
		const create = await capture(buildCreateProposalRegistration(options));
		const refused = await create({ ...proposal, id: 'not an id' });
		expect(refused.isError).toBe(true);
	});

	it('[<200ms] refuses what the scaffold would fill with a placeholder', async () => {
		const create = await capture(buildCreateProposalRegistration(options));
		const refused = await create({
			id: 'f00002',
			title: 'No goal',
			slices: [{ sliceId: 'S1', files: ['src/a.ts'] }],
		});
		expect(refused.isError).toBe(true);
		expect(refused.content[0]?.text).toContain('goal');
		expect(refused.content[0]?.text).toContain('S1 acceptance');
	});
});

describe('scaffoldGaps', () => {
	const whole = {
		goal: 'g',
		why: 'w',
		nonGoals: ['n'],
		slices: [{ sliceId: 'S1', files: ['a.ts'], acceptance: ['a'] }],
	};

	it('[<50ms] finds nothing in a proposal written out in full', () => {
		expect(scaffoldGaps(whole)).toEqual([]);
	});

	it('[<50ms] names every placeholder, blank and missing part', () => {
		expect(
			scaffoldGaps({
				goal: ' ',
				why: 'TODO: why',
				nonGoals: ['- TODO: skip'],
				slices: [
					{
						sliceId: 'S1',
						title: 'TODO',
						files: ['TODO'],
						acceptance: ['TODO: x'],
					},
				],
			}),
		).toEqual([
			'goal',
			'why',
			'nonGoals',
			'S1 acceptance',
			'S1 files or title',
		]);
		expect(scaffoldGaps({ ...whole, nonGoals: [], slices: [] })).toEqual([
			'nonGoals',
			'slices',
		]);
		expect(
			scaffoldGaps({ ...whole, nonGoals: undefined, slices: undefined }),
		).toEqual(['nonGoals', 'slices']);
	});
});
