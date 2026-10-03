/**
 * A unit of work, from any host (x00736): the MCP `work` tool runs the
 * engine the CLI runs, and each server is its own instance.
 */
import { deriveCapabilities } from '@delendai/core/lib/development-policy/derive';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createFakeToolServer } from '@delendai/test-kit';

import {
	buildWorkUnitToolRegistration,
	workUnitDescription,
	workUnitArgs,
} from '@delendai/core/lib/tools/work-unit.tool';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const repo = (): string => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'work-tool-')));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'w@example.com');
	git(root, 'config', 'user.name', 'W');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, '.gitignore'), '.cache/\n');
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
				integration: { requiredChecks: ['ci'] },
			},
		}),
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	return root;
};

interface IAnswer {
	readonly structuredContent: {
		readonly ok: boolean;
		readonly code: number;
		readonly data?: { readonly ref?: string; readonly path?: string };
		readonly error?: string;
	};
}

/** One MCP server's `work` tool, as a host calls it. */
const server = async (root: string, session?: string) => {
	let handler: ((input: unknown) => Promise<unknown>) | undefined;
	await buildWorkUnitToolRegistration({
		namespacePrefix: 'delendai',
		workspaceRoot: root,
		...(session === undefined ? {} : { session }),
	}).register(
		createFakeToolServer({
			onRegisterTool: (registered) => {
				handler = registered.handler as typeof handler;
			},
		}),
	);
	if (handler === undefined) throw new Error('work did not register');
	const call = handler;
	return async (input: Record<string, unknown>) =>
		(await call(input)) as IAnswer;
};

const enterReview = {
	action: 'enter',
	kind: 'review',
	proposal: 'batch',
	slice: 'all',
	agent: 'minimax-m3',
};

describe('the MCP work tool', () => {
	it('enters a unit, and keeps it for every later call from the same server', async () => {
		const root = repo();
		const work = await server(root, 'srv1');

		const first = await work(enterReview);
		const again = await work(enterReview);

		expect(first.structuredContent.ok).toBe(true);
		expect(first.structuredContent.data?.ref).toBe(
			'refs/heads/delendai/wip/minimax-m3/review/batch-all-g1/work',
		);
		expect(again.structuredContent.data?.path).toBe(
			first.structuredContent.data?.path,
		);
	});

	it('gives two servers of one model entering the same unit their own', async () => {
		const root = repo();
		const [one, two] = await Promise.all([server(root), server(root)]);

		const [a, b] = await Promise.all([one(enterReview), two(enterReview)]);

		expect(
			[a, b].map((answer) => answer.structuredContent.data?.ref).sort(),
		).toEqual([
			'refs/heads/delendai/wip/minimax-m3/review/batch-all-g1/work',
			'refs/heads/delendai/wip/minimax-m3/review/batch-all-g2/work',
		]);
	});

	it('answers a refusal as not ok, with why', async () => {
		const root = repo();
		const work = await server(root);

		const refused = await work({ action: 'enter', agent: 'minimax-m3' });

		expect(refused.structuredContent.ok).toBe(false);
		expect(refused.structuredContent.error).toContain('--proposal');
	});
});

describe('the flags the tool passes the engine', () => {
	it('spells each input the way `delendai work` reads it, with the server session', () => {
		expect(
			workUnitArgs(
				{
					action: 'publish',
					proposal: 'x00001',
					slice: 'S1',
					generation: 2,
					paths: ['a.ts', 'b.ts'],
					keepWorkRef: true,
					noPullRequest: true,
				},
				'srv',
			),
		).toEqual([
			'publish',
			'--proposal=x00001',
			'--slice=S1',
			'--generation=2',
			'--session=srv',
			'--paths=a.ts,b.ts',
			'--keep-work-ref',
			'--no-pull-request',
		]);
		expect(
			workUnitArgs({ action: 'status', session: 'mine' }, 'srv'),
		).toEqual(['status', '--session=mine']);
	});
});

describe('workUnitDescription', () => {
	const describeFor = (profile: Parameters<typeof expandProfile>[0]) =>
		workUnitDescription(deriveCapabilities(expandProfile(profile)));

	it('states how publish lands the unit from the policy, never a fixed mechanism', () => {
		expect(describeFor('shared-checkout-merge')).toContain(
			'no pull request',
		);
		expect(describeFor('shared-checkout-pr')).toContain('by pull request');
		expect(describeFor('shared-direct')).not.toMatch(/pull request/u);
	});

	it('stays neutral without a policy', () => {
		expect(workUnitDescription(undefined)).not.toMatch(/pull request/u);
	});
});

describe('a client working in another project', () => {
	const serverFor = async (root: string, clientRoots?: readonly string[]) => {
		let handler: ((input: unknown) => Promise<unknown>) | undefined;
		await buildWorkUnitToolRegistration({
			namespacePrefix: 'delendai',
			workspaceRoot: root,
			session: 'srv-roots',
		}).register(
			createFakeToolServer({
				...(clientRoots === undefined ? {} : { clientRoots }),
				onRegisterTool: (registered) => {
					handler = registered.handler as typeof handler;
				},
			}),
		);
		if (handler === undefined) throw new Error('work did not register');
		const call = handler;
		return async (input: Record<string, unknown>) =>
			(await call(input)) as IAnswer;
	};

	it('is refused a unit here, with both directories named', async () => {
		const root = repo();
		const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'other-')));
		roots.push(elsewhere);
		const work = await serverFor(root, [`file://${elsewhere}`]);
		const answer = await work(enterReview);
		expect(answer.structuredContent.ok).toBe(false);
		expect(answer.structuredContent.error).toContain(root);
		expect(answer.structuredContent.error).toContain(elsewhere);
		expect(git(root, 'for-each-ref', 'refs/heads/delendai')).toBe('');
	});

	it('still reads the swarm, and still enters from this project', async () => {
		const root = repo();
		const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'other-')));
		roots.push(elsewhere);
		const reading = await serverFor(root, [`file://${elsewhere}`]);
		expect((await reading({ action: 'swarm' })).structuredContent.ok).toBe(
			true,
		);
		const here = await serverFor(root, [`file://${root}`]);
		expect((await here(enterReview)).structuredContent.ok).toBe(true);
	});
});
