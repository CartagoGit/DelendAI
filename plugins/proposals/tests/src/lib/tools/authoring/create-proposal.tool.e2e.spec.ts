/**
 * create-proposal.tool.e2e.spec.ts — the create_proposal handler: where it
 * writes, what it refuses, and the publication step it names.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createFakeToolServer,
	createGitRepoTemplate,
} from '@delendai/test-kit';

import type { IToolRegistration } from '@delendai/core/contracts';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

import type { IAuthoringToolOptions } from '@delendai/proposals/lib/tools/authoring.tool';
import { buildCreateProposalRegistration } from '@delendai/proposals/lib/tools/authoring/create-proposal.tool';

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

const parse = (result: { content: Array<{ text: string }> }) =>
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

	it('[<1000ms] writes the document and, with no git runner, names the step that publishes it', async () => {
		const create = await capture(buildCreateProposalRegistration(options));
		const created = parse(await create(proposal));
		expect(created.id).toBe('f00001');
		expect(created.published).toBe(false);
		expect(String(created.publishReason)).toContain('no git runner');
	});

	it('[<1000ms] names the publication ref of the policy, with no namespace of its own', async () => {
		const create = await capture(
			buildCreateProposalRegistration({
				...options,
				developmentPolicy: resolveDevelopmentPolicy({
					development: {
						profile: 'shared-checkout-pr',
						branches: { namespacePrefix: '' },
					},
				}),
			}),
		);
		const created = parse(await create(proposal));
		expect(created.id).toBe('f00001');
		expect(String(created.nextAction)).not.toContain('delendai/pr/');
	});

	it('[<1500ms] create_proposal called from a create unit writes the proposal there', async () => {
		const { root: repo, worktrees } = createGitRepoTemplate({
			files: { 'a.txt': 'a' },
			trunk: 'develop',
			worktrees: {
				'create-tree': 'delendai/wip/agent-a/create/new-all-g1/topic',
			},
		}).copy();
		const tree = worktrees['create-tree'] ?? '';
		const create = await capture(
			buildCreateProposalRegistration({
				...options,
				workspaceRoot: repo,
				proposalsDirAbs: join(repo, 'docs/delendai/proposals'),
				indexPathAbs: join(
					repo,
					'.cache/delendai/proposals/index.json',
				),
				developmentPolicy: resolveDevelopmentPolicy({
					development: { profile: 'shared-checkout-pr' },
				}),
			}),
		);
		const made = await create({
			id: 'f00001',
			title: 'Create me',
			goal: 'A goal.',
			why: 'A reason.',
			nonGoals: ['Nothing else.'],
			slices: [
				{
					sliceId: 'S1',
					files: ['src/a.ts'],
					acceptance: ['It works'],
				},
			],
			checkout: tree,
		});
		expect(made.content[0]?.text).not.toContain('belongs to');
		expect(existsSync(join(tree, 'docs/delendai/proposals'))).toBe(true);
	});
});
