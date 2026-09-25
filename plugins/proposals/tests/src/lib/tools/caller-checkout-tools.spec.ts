/**
 * caller-checkout-tools.spec.ts — x00638 S2.
 *
 * Every proposals tool declared `caller-checkout` acts in the working
 * tree the call names. Driven against a real repository with a shared
 * checkout and a linked worktree, through the plugin's own registrations
 * bound the way the host binds them: a proposal that exists only in the
 * worktree is found, and the shared checkout is left untouched.
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

import { afterEach, describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/public';
import { bindWriteRoot } from '@delendai/core/lib/shared/bind-write-root';
import { createFakeToolServer, fakePartial } from '@delendai/test-kit';

import type { ILogIncident } from '@delendai/logs/public';
import plugin from '@delendai/proposals';
import { buildAutoFixQueueRegistration } from '@delendai/proposals/lib/tools/auto-fix-queue.tool';
import { buildIncidentProposalRegistration } from '@delendai/proposals/lib/tools/incident-proposal.tool';

const incident = (): ILogIncident => ({
	incidentType: 'tool-failure',
	toolName: 'proposals_incident_proposals',
	hasStack: true,
	count: 4,
	distinctAgents: 2,
	firstSeen: '2026-08-24T10:00:00.000Z',
	lastSeen: '2026-08-24T11:00:00.000Z',
	sampleSummary: 'tool-failed: invalid regex in cluster classifier',
	sampleError: 'invalid regex: [unterminated character class',
	recentEvents: [],
});

const ONLY_IN_WORKTREE = 'x99638';
const PROPOSALS_REL = 'docs/delendai/proposals';

const git = (cwd: string, args: readonly string[]): string =>
	execFileSync('git', [...args], { cwd, encoding: 'utf8' });

const made: string[] = [];
afterEach(() => {
	for (const dir of made.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const document = `---
id: ${ONLY_IN_WORKTREE}
title: "A proposal only the worktree has"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-24
---

# ${ONLY_IN_WORKTREE} — A proposal only the worktree has

## goal

Be found where the caller stands.

## Slices

### S1 — The only slice

- **Status**: in-progress
- **Gate**: none
- **Files**: \`docs/delendai/proposals/in-progress/${ONLY_IN_WORKTREE}-only-in-the-worktree.md\`
`;

const repositoryWithWorktree = () => {
	const parent = mkdtempSync(join(tmpdir(), 'x00638-'));
	made.push(parent);
	const checkout = join(parent, 'checkout');
	for (const folder of ['in-progress', 'review', 'done', 'ready']) {
		mkdirSync(join(checkout, PROPOSALS_REL, folder), { recursive: true });
		writeFileSync(join(checkout, PROPOSALS_REL, folder, '.gitkeep'), '');
	}
	git(parent, ['init', '-q', '-b', 'develop', 'checkout']);
	git(checkout, ['config', 'user.email', 'spec@example.test']);
	git(checkout, ['config', 'user.name', 'Spec']);
	git(checkout, ['add', '-A']);
	git(checkout, ['commit', '-q', '-m', 'empty proposals tree']);
	const worktree = join(parent, 'worktree');
	git(checkout, ['worktree', 'add', '-q', '-b', 'work', worktree, 'develop']);
	writeFileSync(
		join(
			worktree,
			PROPOSALS_REL,
			'in-progress',
			`${ONLY_IN_WORKTREE}-only-in-the-worktree.md`,
		),
		document,
	);
	git(worktree, ['add', '-A']);
	git(worktree, ['commit', '-q', '-m', 'a proposal on the work branch']);
	return { checkout, worktree };
};

const ctx = (root: string) =>
	fakePartial<IMcpPluginContext>({
		workspace: { root, resolve: (rel: string) => join(root, rel) },
		corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
		cacheDir: '.cache/delendai',
		docsDir: 'docs/delendai',
		keepLegacy: false,
		pluginCacheDir: '.cache/delendai/proposals',
		pluginDocsDir: 'docs/delendai/proposals',
		namespacePrefix: 'proposals',
		options: {},
		args: {},
	});

/** The plugin's handlers, bound to the checkout root as the host binds them. */
const handlersAt = async (
	checkout: string,
): Promise<Map<string, (args: unknown) => unknown>> => {
	const handlers = new Map<string, (args: unknown) => unknown>();
	const registrations = await plugin.register(ctx(checkout));
	const server = createFakeToolServer({
		onRegisterTool: ({ name, handler }) => {
			handlers.set(name.replace(/^proposals_/u, ''), handler);
		},
	});
	for (const tool of registrations.tools ?? []) {
		await bindWriteRoot(tool, checkout).register(server);
	}
	return handlers;
};

/** The handler's structured answer. */
const answer = async (
	handlers: Map<string, (args: unknown) => unknown>,
	name: string,
	args: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
	const handler = handlers.get(name);
	if (handler === undefined) throw new Error(`no handler for ${name}`);
	const result = (await handler(args)) as {
		readonly structuredContent: Record<string, unknown>;
	};
	return result.structuredContent;
};

/** What the shared checkout holds: it must not change. */
const sharedState = (checkout: string): string =>
	git(checkout, ['status', '--porcelain', '--untracked-files=all']);

describe('x00638 S2 — proposals tools act in the caller’s checkout', () => {
	it('sync_proposals indexes the worktree’s proposals, in the worktree', async () => {
		const { checkout, worktree } = repositoryWithWorktree();
		const handlers = await handlersAt(checkout);
		const synced = await answer(handlers, 'sync_proposals', {
			checkout: worktree,
		});
		expect(synced.count).toBe(1);
		expect(String(synced.indexPath).startsWith(worktree)).toBe(true);
		expect(sharedState(checkout)).toBe('');
	});

	it('close_slice, proposal_review and proposals_close_plan find a proposal only the worktree has', async () => {
		const { checkout, worktree } = repositoryWithWorktree();
		const handlers = await handlersAt(checkout);
		const review = await answer(handlers, 'proposal_review', {
			proposalId: ONLY_IN_WORKTREE,
			sliceId: 'S1',
			action: 'status',
			agent: 'spec',
			checkout: worktree,
		});
		expect(review.ok).toBe(true);
		// Found, then refused for a reason about the slice itself.
		const close = await answer(handlers, 'close_slice', {
			proposalId: ONLY_IN_WORKTREE,
			sliceId: 'S1',
			checkout: worktree,
		});
		expect(close.kind).toBe('peer-review-required');
		const plan = await answer(handlers, 'proposals_close_plan', {
			planId: ONLY_IN_WORKTREE,
			checkout: worktree,
		});
		expect(JSON.stringify(plan)).toContain('not \\"plan\\"');
		expect(sharedState(checkout)).toBe('');
	});

	it('without a checkout, the same tools answer from the server’s tree', async () => {
		const { checkout } = repositoryWithWorktree();
		const handlers = await handlersAt(checkout);
		const review = await answer(handlers, 'proposal_review', {
			proposalId: ONLY_IN_WORKTREE,
			sliceId: 'S1',
			action: 'status',
			agent: 'spec',
		});
		expect(JSON.stringify(review)).toContain('not in index');
	});

	it('the recovery tools move and reconcile the proposal in the worktree', async () => {
		const { checkout, worktree } = repositoryWithWorktree();
		const handlers = await handlersAt(checkout);
		const moved = await answer(handlers, 'proposal_force_transition', {
			id: ONLY_IN_WORKTREE,
			to: 'review',
			reason: 'x00638 S2',
			checkout: worktree,
		});
		expect(moved.ok).toBe(true);
		expect(
			existsSync(join(worktree, PROPOSALS_REL, String(moved.movedTo))),
		).toBe(true);
		const reconciled = await answer(handlers, 'proposal_reconcile_folder', {
			id: ONLY_IN_WORKTREE,
			checkout: worktree,
		});
		expect(reconciled.path).toBe(moved.movedTo);
		expect(sharedState(checkout)).toBe('');
	});

	it('incident_proposals and auto_fix_queue write their drafts in the worktree', async () => {
		for (const build of [
			buildIncidentProposalRegistration,
			buildAutoFixQueueRegistration,
		]) {
			const { checkout, worktree } = repositoryWithWorktree();
			const options = {
				namespacePrefix: 'proposals',
				workspaceRoot: checkout,
				proposalsDirAbs: join(checkout, PROPOSALS_REL),
				indexPathAbs: join(
					checkout,
					'.cache/delendai/proposals/index.json',
				),
				counterPathAbs: join(
					checkout,
					'.cache/proposal-id-counters.json',
				),
				layout: {
					proposalsDir: PROPOSALS_REL,
					proposalIndexFile: '.cache/delendai/proposals/index.json',
				},
				readIncidents: async () => ({
					incidents: [incident()],
					totalIncidents: 1,
				}),
			};
			const handlers = new Map<string, (args: unknown) => unknown>();
			await bindWriteRoot(build(options), checkout).register(
				createFakeToolServer({
					onRegisterTool: ({ name, handler }) => {
						handlers.set(name, handler);
					},
				}),
			);
			const [name] = handlers.keys();
			if (name === undefined) throw new Error('nothing registered');
			const written = await answer(handlers, name, {
				write: true,
				checkout: worktree,
			});
			const files = written.files as readonly string[];
			expect(files.length).toBeGreaterThan(0);
			for (const file of files) {
				expect(existsSync(join(worktree, PROPOSALS_REL, file))).toBe(
					true,
				);
			}
			// The id counter is the repository's, so two worktrees never
			// hand out the same id: it is the one thing written there.
			expect(sharedState(checkout)).toBe(
				'?? .cache/proposal-id-counters.json\n',
			);
		}
	});

	it('inherit_host_instructions reads the worktree’s host files and writes its proposal there', async () => {
		const { checkout, worktree } = repositoryWithWorktree();
		writeFileSync(
			join(worktree, 'AGENTS.md'),
			'# Team rules\n\nAlways run the linter before pushing.\n',
		);
		const handlers = await handlersAt(checkout);
		const inherited = await answer(handlers, 'inherit_host_instructions', {
			workspaceRoot: worktree,
			checkout: worktree,
		});
		expect(inherited.totalNonCanonical).toBeGreaterThan(0);
		expect(existsSync(String(inherited.path))).toBe(true);
		expect(String(inherited.path).startsWith(worktree)).toBe(true);
		// The server's tree has no AGENTS.md, so nothing to inherit there.
		const fromServer = await answer(handlers, 'inherit_host_instructions', {
			workspaceRoot: checkout,
		});
		expect(fromServer.files).toEqual([]);
	});
});
