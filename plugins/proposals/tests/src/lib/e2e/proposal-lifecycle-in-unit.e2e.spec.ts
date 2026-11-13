/**
 * End-to-end: a proposal's lifecycle moves in the unit that carries it,
 * under every profile, without the caller naming the worktree.
 *
 * A proposal created or implemented in a unit exists only on that unit's
 * ref until its work lands. Driven through a real MCP client against a
 * real repository whose shared checkout sits on the integration branch,
 * `proposal_transition` finds it there:
 * the move is written and committed in the unit, so it lands with the
 * pull request or the merge, and the shared checkout is left alone. A
 * project that commits to its integration branch directly has no unit,
 * and the move is made where the proposal is.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	createAssembledProposalsServer,
	type IAssembledProposalsServer,
} from './assembled-proposals-server';

const ID = 'x99773';
const FILE = `${ID}-lifecycle-in-the-unit.md`;
const PROPOSALS = 'docs/delendai/proposals';
const UNIT_BRANCH = `wip/agent-a/implement/${ID}-S1-g1/lifecycle`;

const git = (cwd: string, ...args: readonly string[]): string =>
	execFileSync('git', [...args], { cwd, encoding: 'utf8' });

const DOCUMENT = `---
id: ${ID}
title: "Lifecycle in the unit"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-09-30
---

# ${ID} — Lifecycle in the unit

## goal

Move where the proposal is.

## Slices

### S1 — The only slice

- **Status**: pending
- **Gate**: none
- **Files**: \`packages/x/src/a.ts\`
`;

const PROFILES = [
	'shared-checkout-pr',
	'shared-checkout-merge',
	'worktree-pr',
] as const;

const configFor = (profile: string): string =>
	JSON.stringify({
		development: {
			profile,
			integration: { requiredChecks: ['delendai-validate'] },
		},
	});

/** A repository on `develop`, with the config written and committed. */
const repository = (profile: string): string => {
	const parent = mkdtempSync(join(tmpdir(), 'lifecycle-unit-'));
	parents.push(parent);
	const workspace = join(parent, 'checkout');
	mkdirSync(workspace);
	git(workspace, 'init', '-q', '-b', 'develop');
	git(workspace, 'config', 'user.email', 'spec@example.test');
	git(workspace, 'config', 'user.name', 'Spec');
	for (const folder of ['ready/fixes', 'in-progress', 'review', 'done']) {
		mkdirSync(join(workspace, PROPOSALS, folder), { recursive: true });
		writeFileSync(join(workspace, PROPOSALS, folder, '.gitkeep'), '');
	}
	writeFileSync(join(workspace, 'delendai.config.json'), configFor(profile));
	writeFileSync(join(workspace, '.gitignore'), '.cache/\n');
	git(workspace, 'add', '-A');
	git(workspace, 'commit', '-q', '-m', 'project');
	return workspace;
};

/** A unit of work whose branch alone carries the proposal. */
const unitWithProposal = (workspace: string): string => {
	const worktree = join(workspace, '..', `${ID}-unit`);
	git(workspace, 'worktree', 'add', '-q', '-b', UNIT_BRANCH, worktree);
	writeFileSync(join(worktree, PROPOSALS, 'ready/fixes', FILE), DOCUMENT);
	git(worktree, 'add', '-A');
	git(worktree, 'commit', '-q', '-m', 'the proposal');
	return worktree;
};

const parents: string[] = [];
let server: IAssembledProposalsServer | undefined;

const serve = async (profile: string, workspace: string) => {
	// A CI job's checkout is exempt from the shared-checkout refusal; this
	// spec is about the checkout agents share.
	vi.stubEnv('CI', '');
	server = await createAssembledProposalsServer({
		workspace,
		workspaceConfig: configFor(profile),
	});
	return server;
};

beforeEach(() => {
	server = undefined;
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await server?.close();
	for (const parent of parents.splice(0)) {
		rmSync(parent, { recursive: true, force: true });
	}
});

describe.each(PROFILES)('proposal lifecycle in the unit — %s', (profile) => {
	it('moves the proposal in the unit that carries it, and commits it there', async () => {
		const workspace = repository(profile);
		const worktree = unitWithProposal(workspace);
		const { callTool } = await serve(profile, workspace);
		await callTool('delendai_proposals_sync_proposals', {
			checkout: worktree,
		});

		const answer = await callTool(
			'delendai_proposals_proposal_transition',
			{
				id: ID,
				to: 'in-progress',
				reason: 'starting the work',
			},
		);

		expect(answer.text).toContain('in-progress');
		expect(answer.ok).toBe(true);
		expect(existsSync(join(worktree, PROPOSALS, 'in-progress', FILE))).toBe(
			true,
		);
		expect(git(worktree, 'status', '--porcelain')).toBe('');
		expect(git(worktree, 'log', '-1', '--format=%s')).toContain(ID);
		expect(git(workspace, 'status', '--porcelain', '-uall')).toBe('');
		expect(git(workspace, 'log', '--format=%s')).not.toContain(ID);
	});

	it('does not guess between two units that carry the proposal', async () => {
		const workspace = repository(profile);
		unitWithProposal(workspace);
		const second = join(workspace, '..', `${ID}-second`);
		git(
			workspace,
			'worktree',
			'add',
			'-q',
			'-b',
			`wip/agent-b/implement/${ID}-S2-g1/other`,
			second,
		);
		const { callTool } = await serve(profile, workspace);

		const answer = await callTool(
			'delendai_proposals_proposal_transition',
			{
				id: ID,
				to: 'in-progress',
				reason: 'starting the work',
			},
		);

		expect(answer.ok).toBe(false);
		expect(answer.text).toContain(second);
	});
});

describe('proposal lifecycle in a project that commits directly', () => {
	it('moves the proposal where it is, in the shared checkout', async () => {
		const workspace = repository('shared-direct');
		writeFileSync(
			join(workspace, PROPOSALS, 'ready/fixes', FILE),
			DOCUMENT,
		);
		git(workspace, 'add', '-A');
		git(workspace, 'commit', '-q', '-m', 'the proposal');
		const { callTool } = await serve('shared-direct', workspace);
		await callTool('delendai_proposals_sync_proposals', {});

		const answer = await callTool(
			'delendai_proposals_proposal_transition',
			{
				id: ID,
				to: 'in-progress',
				reason: 'starting the work',
			},
		);

		expect(answer.text).toContain('in-progress');
		expect(answer.ok).toBe(true);
		expect(
			existsSync(join(workspace, PROPOSALS, 'in-progress', FILE)),
		).toBe(true);
	});
});
