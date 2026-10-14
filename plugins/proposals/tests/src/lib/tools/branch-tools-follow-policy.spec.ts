/**
 * branch-tools-follow-policy.spec.ts — the branch snapshot, the branch
 * reaper and the hygiene report answer for THIS project's branches.
 *
 * The project here is not shaped like the repository that wrote the
 * tools: its integration branch is `trunk`, its refs live under an
 * `acme` namespace, and `develop` does not exist. A tool that fell back
 * to `develop` or `agent/*` would judge every branch against a branch
 * that is not there.
 *
 * Every call goes through a real MCP client after `listTools`, because
 * the SDK client validates `structuredContent` against the tool's
 * `outputSchema` on the first listing, error results included.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildBranchGcRegistration } from '@delendai/proposals/lib/tools/branch-gc.tool';
import { buildBranchStatusRegistration } from '@delendai/proposals/lib/tools/branch-status.tool';
import { buildSwarmHygieneRegistration } from '@delendai/proposals/lib/tools/swarm-hygiene.tool';
import { managedBranchPrefixes } from '@delendai/proposals/lib/shared/branch-namespaces';

const WORK = 'acme/wip/bot/implement/x1-S1-g1/delivered';
const OPEN_WORK = 'acme/wip/bot/implement/x2-S1-g1/still-going';
const PUBLICATION = 'acme/pr/bot/implement/x1-S1-g1/delivered';
const AGENT_WORKTREE = 'agent/old-session';
const FOREIGN = 'feature/legacy';

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

let root = '';
let worktrees = '';

/** A branch with one commit of its own, checked out in a worktree of its own. */
const branchWithWorktree = (
	branch: string,
	dir: string,
	options: { readonly merged: boolean },
): string => {
	const path = join(worktrees, dir);
	git(root, 'worktree', 'add', '-q', '-b', branch, path, 'trunk');
	writeFileSync(join(path, `${dir}.txt`), `${branch}\n`);
	git(path, 'add', '.');
	git(path, 'commit', '-q', '--no-verify', '-m', `work on ${branch}`);
	if (options.merged) {
		git(
			root,
			'merge',
			'-q',
			'--no-ff',
			'--no-verify',
			'-m',
			branch,
			branch,
		);
	}
	return path;
};

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'branch-policy-'));
	worktrees = mkdtempSync(join(tmpdir(), 'branch-policy-wt-'));
	git(root, 'init', '-q', '-b', 'trunk');
	git(root, 'config', 'user.email', 'author@example.com');
	git(root, 'config', 'user.name', 'Author');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: {
					integration: 'trunk',
					release: 'stable',
					namespacePrefix: 'acme',
				},
			},
		}),
	);
	writeFileSync(join(root, 'README.md'), '# project\n');
	git(root, 'add', '.');
	git(root, 'commit', '-q', '--no-verify', '-m', 'base');
	mkdirSync(join(root, '.cache/delendai/.worktrees'), { recursive: true });
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
	rmSync(worktrees, { recursive: true, force: true });
});

interface IServed {
	readonly call: (
		name: string,
		args?: Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
	readonly close: () => Promise<void>;
}

/** The three tools, registered exactly as the plugin does: no branch defaults. */
const serve = async (): Promise<IServed> => {
	const server = new McpServer({ name: 'branch-policy', version: '0.0.0' });
	const base = { namespacePrefix: 'spec', workspaceRoot: root };
	await buildBranchStatusRegistration({
		...base,
		canonicalWorktreesDirRel: '.cache/delendai/.worktrees',
	}).register(server);
	await buildBranchGcRegistration({
		...base,
		defaultStaleMinutes: 60,
	}).register(server);
	await buildSwarmHygieneRegistration({
		...base,
		defaultStaleMinutes: 60,
	}).register(server);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	const client = new Client({ name: 'branch-policy-client', version: '0' });
	await client.connect(clientTransport);
	await client.listTools();
	return {
		call: async (name, args = {}) => {
			const result = await client.callTool({ name, arguments: args });
			return (result.structuredContent ?? {}) as Record<string, unknown>;
		},
		close: async () => {
			await client.close();
			await server.close();
		},
	};
};

const names = (entries: unknown): string[] =>
	(
		entries as ReadonlyArray<{
			readonly branch?: string;
			readonly name?: string;
		}>
	).map((entry) => entry.branch ?? entry.name ?? '');

describe('the namespaces come from the project policy', () => {
	it('are the configured work-ref and publication prefixes, plus the agent_worktree one', async () => {
		expect(await managedBranchPrefixes(root)).toEqual([
			'acme/wip/',
			'acme/pr/',
			'agent/',
		]);
	});
});

describe('branch_status', () => {
	it('measures against the declared integration branch and lists the project namespaces', async () => {
		branchWithWorktree(WORK, 'work', { merged: false });
		branchWithWorktree(PUBLICATION, 'pub', { merged: false });
		branchWithWorktree(AGENT_WORKTREE, 'agent', { merged: false });
		branchWithWorktree(FOREIGN, 'foreign', { merged: false });
		const served = await serve();
		try {
			const status = await served.call('spec_branch_status');
			expect(status.ok).toBe(true);
			expect(status.baseBranch).toBe('trunk');
			expect(names(status.branches).sort()).toEqual(
				[AGENT_WORKTREE, PUBLICATION, WORK].sort(),
			);
		} finally {
			await served.close();
		}
	});
});

describe('branch_gc', () => {
	it('plans to remove only the worktrees whose ref the verdict proves delivered', async () => {
		branchWithWorktree(WORK, 'work', { merged: true });
		branchWithWorktree(OPEN_WORK, 'open', { merged: false });
		branchWithWorktree(PUBLICATION, 'pub', { merged: true });
		branchWithWorktree(AGENT_WORKTREE, 'agent', { merged: true });
		branchWithWorktree(FOREIGN, 'foreign', { merged: true });
		const served = await serve();
		try {
			const plan = await served.call('spec_branch_gc');
			expect(plan.ok).toBe(true);
			expect(plan.baseBranch).toBe('trunk');
			expect(plan.dryRun).toBe(true);
			expect(names(plan.removed).sort()).toEqual(
				[AGENT_WORKTREE, WORK].sort(),
			);
			const skipped = Object.fromEntries(
				(
					plan.skipped as ReadonlyArray<{
						branch: string;
						reason: string;
					}>
				).map((entry) => [entry.branch, entry.reason]),
			);
			// Merged into trunk, but nothing shows a pull request took it: the
			// ref may be the only copy of what it carried.
			expect(skipped[PUBLICATION]).toBe('undelivered');
			expect(skipped[OPEN_WORK]).toBeDefined();
			expect(skipped[OPEN_WORK]).not.toBe('undelivered');
			expect(skipped.trunk).toBe('protected-branch');
		} finally {
			await served.close();
		}
	});

	it('never removes a merged branch outside every namespace, whatever git says', async () => {
		const path = branchWithWorktree(FOREIGN, 'foreign', { merged: true });
		const served = await serve();
		try {
			const executed = await served.call('spec_branch_gc', {
				dryRun: false,
				force: true,
			});
			expect(executed.ok).toBe(true);
			expect(executed.removed).toEqual([]);
			expect(git(root, 'worktree', 'list')).toContain(path);
		} finally {
			await served.close();
		}
	});

	it('removes a delivered worktree for real and leaves the rest', async () => {
		const delivered = branchWithWorktree(WORK, 'work', { merged: true });
		const open = branchWithWorktree(OPEN_WORK, 'open', { merged: false });
		const served = await serve();
		try {
			const executed = await served.call('spec_branch_gc', {
				dryRun: false,
			});
			expect(names(executed.removed)).toEqual([WORK]);
			const listing = git(root, 'worktree', 'list');
			expect(listing).not.toContain(delivered);
			expect(listing).toContain(open);
		} finally {
			await served.close();
		}
	});
});

describe('swarm_hygiene', () => {
	it('flags only the worktree branches outside the project namespaces', async () => {
		branchWithWorktree(WORK, 'work', { merged: false });
		branchWithWorktree(AGENT_WORKTREE, 'agent', { merged: false });
		branchWithWorktree(FOREIGN, 'foreign', { merged: false });
		const served = await serve();
		try {
			const report = await served.call('spec_swarm_hygiene');
			expect(report.ok).toBe(true);
			expect(report.baseBranch).toBe('trunk');
			expect(names(report.nonConformingBranches)).toEqual([FOREIGN]);
		} finally {
			await served.close();
		}
	});
});
