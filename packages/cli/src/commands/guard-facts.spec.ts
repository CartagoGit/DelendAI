/**
 * guard-facts.spec.ts — what the guard reads from real git and the
 * project's configuration, in-process.
 *
 * The hook-level spec proves the wiring through a subprocess; this proves
 * each fact against a real repository, including the ones that decide
 * whether anything is enforced at all.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runHumanCli } from '../index';
import { fakePartial } from '@delendai/test-kit';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import {
	createGuardCommand,
	defaultGuardFacts,
	readStream,
} from './guard.command';

/** Run something that writes to stdout, and give back what it wrote. */
const captureStdout = async (
	run: () => Promise<number>,
): Promise<{ readonly code: number; readonly out: string }> => {
	const chunks: string[] = [];
	const original = process.stdout.write;
	process.stdout.write = ((chunk: string) => {
		chunks.push(String(chunk));
		return true;
	}) as typeof process.stdout.write;
	try {
		return { code: await run(), out: chunks.join('') };
	} finally {
		process.stdout.write = original;
	}
};

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const repo = (config?: string): string => {
	const root = mkdtempSync(join(tmpdir(), 'guard-facts-'));
	roots.push(root);
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' });
	git('init', '-q', '-b', 'develop');
	git('config', 'user.email', 'facts@example.com');
	git('config', 'user.name', 'Facts');
	git('config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# r\n');
	if (config !== undefined) {
		writeFileSync(join(root, 'delendai.config.json'), config);
	}
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	return root;
};

describe('defaultGuardFacts', () => {
	it('reads the branch, and no merge in progress', () => {
		const facts = defaultGuardFacts(repo());
		expect(facts.branch()).toBe('develop');
		expect(facts.isMerge()).toBe(false);
	});

	it('reports a detached HEAD as no branch', () => {
		const root = repo();
		execFileSync('git', ['checkout', '-q', '--detach'], { cwd: root });
		expect(defaultGuardFacts(root).branch()).toBeUndefined();
	});

	it('reads a declared development policy', async () => {
		const policy = await defaultGuardFacts(
			repo('{ "development": { "profile": "shared-checkout-merge" } }'),
		).policy(roots.at(-1) ?? '');
		expect(policy?.profile).toBe('shared-checkout-merge');
	});

	it('adopts the default model without a configuration or a development block', async () => {
		const bare = repo();
		const adopted = await defaultGuardFacts(bare).policy(bare);
		expect(adopted.profile).toBe('shared-checkout-merge');
		expect(adopted.source).toBe('default');
		const noBlock = repo('{ "plugins": {} }');
		expect((await defaultGuardFacts(noBlock).policy(noBlock)).profile).toBe(
			'shared-checkout-merge',
		);
	});

	it('refuses to guess from a configuration that does not parse', async () => {
		const broken = repo('{ "development": ');
		await expect(defaultGuardFacts(broken).policy(broken)).rejects.toThrow(
			'does not parse',
		);
	});
});

describe('readStream', () => {
	it('collects every chunk git writes to the hook', async () => {
		expect(
			await readStream(
				Readable.from(['0000 a refs/heads/x\n', 'more\n']),
			),
		).toBe('0000 a refs/heads/x\nmore\n');
	});

	it('reads nothing from an interactive terminal', async () => {
		const tty = Object.assign(Readable.from(['ignored']), { isTTY: true });
		expect(await readStream(tty)).toBe('');
	});
});

describe('delendai guard through the CLI entry', () => {
	it('answers offline, refusing an agent commit on develop under the policy', async () => {
		// The guard governs agents (x00626); say one is running git rather
		// than inheriting it from whoever runs the suite.
		vi.stubEnv('AI_AGENT', 'guard-facts-spec_1_agent');
		const root = repo(
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		const errors: string[] = [];
		const original = process.stderr.write;
		process.stderr.write = ((chunk: string) => {
			errors.push(String(chunk));
			return true;
		}) as typeof process.stderr.write;
		try {
			const code = await runHumanCli(
				['guard', 'pre-commit', `--workspace=${root}`],
				root,
			);
			expect(code).not.toBe(0);
		} finally {
			process.stderr.write = original;
		}
		vi.unstubAllEnvs();
		expect(errors.join('')).toContain(
			'forbids committing directly to `develop`',
		);
	});
});

const contextFor = (workspace: string): ICliCommandContext =>
	fakePartial<ICliCommandContext, 'cwd' | 'globals'>({
		cwd: workspace,
		globals: fakePartial<ICliCommandContext['globals'], 'workspace'>({
			workspace,
		}),
	});

describe('delendai guard status through the CLI entry', () => {
	it('prints what it found, and a JSON envelope when asked', async () => {
		const root = repo(
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		const text = await captureStdout(() =>
			runHumanCli(['guard', 'status', `--workspace=${root}`], root),
		);
		expect(text.code).toBe(0);
		expect(text.out).toContain('pre-commit: absent');

		const json = await captureStdout(() =>
			runHumanCli(
				['guard', 'status', '--json', `--workspace=${root}`],
				root,
			),
		);
		expect(json.code).toBe(0);
		const envelope = JSON.parse(json.out) as {
			readonly hooks: ReadonlyArray<Record<string, unknown>>;
		};
		// pre-commit, commit-msg, reference-transaction, pre-push,
		// post-checkout, post-merge, post-commit and post-index-change.
		expect(envelope.hooks).toHaveLength(8);
		expect(envelope.hooks[0]).toMatchObject({
			hook: 'pre-commit',
			state: 'absent',
		});
	}, 60_000);
});

describe('delendai guard install / status / uninstall', () => {
	it('installs with an explicit invocation, reports status, and uninstalls', async () => {
		const root = repo();
		const run = (args: string[]) =>
			captureStdout(async () => {
				const result = await createGuardCommand().run(
					args,
					contextFor(root),
				);
				return result.code;
			});
		const installed = await run([
			'install',
			'--runner=bun',
			'--entry=/opt/delendai/cli.ts',
		]);
		expect(installed.code).toBe(0);
		expect(installed.out).toContain('pre-commit: created');
		expect((await run(['status'])).out).toContain(
			'reference-transaction: installed',
		);
		expect((await run(['uninstall'])).out).toContain('pre-push: removed');
	});

	it('exits non-zero when a hook manager keeps it from installing', async () => {
		const root = repo();
		writeFileSync(join(root, 'lefthook.yml'), 'pre-commit: {}\n');
		const attempt = await captureStdout(async () => {
			const result = await createGuardCommand().run(
				['install'],
				contextFor(root),
			);
			return result.code;
		});
		expect(attempt.code).not.toBe(0);
		expect(attempt.out).toContain('unsupported — lefthook');
	});
});

describe('delendai guard post-commit', () => {
	it("pushes a unit's branch to the forge, and says so when the forge refuses it", async () => {
		const root = repo(
			'{ "development": { "profile": "shared-checkout-pr", "branches": { "namespacePrefix": "delendai" } } }',
		);
		const git = (cwd: string, ...args: string[]) =>
			execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
		const remote = mkdtempSync(join(tmpdir(), 'guard-forge-'));
		roots.push(remote);
		git(remote, 'init', '-q', '--bare', '-b', 'develop');
		git(root, 'remote', 'add', 'origin', remote);
		git(root, 'push', '-q', 'origin', 'develop');
		const unit = mkdtempSync(join(tmpdir(), 'guard-unit-'));
		roots.push(unit);
		const branch = 'delendai/wip/agent/x1-all-g1/topic';
		git(root, 'worktree', 'add', '-q', '-b', branch, join(unit, 'u'));
		const tree = join(unit, 'u');
		writeFileSync(join(tree, 'b.txt'), 'b\n');
		git(tree, 'add', '-A');
		git(tree, 'commit', '-q', '-m', 'work');
		const hook = () =>
			createGuardCommand().run(['post-commit'], contextFor(tree));

		expect((await hook()).code).toBe(0);
		expect(git(remote, 'rev-parse', branch)).toBe(
			git(tree, 'rev-parse', 'HEAD'),
		);

		git(tree, 'commit', '-q', '--amend', '-m', 'rewritten');
		const written: string[] = [];
		const spy = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation((chunk: string | Uint8Array) => {
				written.push(String(chunk));
				return true;
			});
		try {
			expect((await hook()).code).toBe(0);
		} finally {
			spy.mockRestore();
		}
		expect(written.join('')).toContain('on this machine only');
	}, 60_000);
});

describe('delendai guard post-commit, when the proposal leaves in-progress', () => {
	it('starts the publication outside the hook, without the git environment git gave the hook', async () => {
		const root = repo(
			'{ "development": { "profile": "shared-checkout-pr", "branches": { "namespacePrefix": "delendai" } } }',
		);
		const git = (cwd: string, ...args: string[]) =>
			execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
		const unit = mkdtempSync(join(tmpdir(), 'guard-leave-'));
		roots.push(unit);
		const branch = 'delendai/wip/agent/implement/x1-all-g1/topic';
		const tree = join(unit, 'u');
		git(root, 'worktree', 'add', '-q', '-b', branch, tree);
		const move = (from: string | undefined, to: string) => {
			execFileSync('mkdir', [
				'-p',
				join(tree, 'docs/delendai/proposals', to),
			]);
			if (from === undefined)
				writeFileSync(
					join(tree, 'docs/delendai/proposals', to, 'x1-a.md'),
					'# x1\n',
				);
			else
				git(
					tree,
					'mv',
					`docs/delendai/proposals/${from}/x1-a.md`,
					`docs/delendai/proposals/${to}/x1-a.md`,
				);
			git(tree, 'add', '-A');
			git(tree, 'commit', '-q', '-m', `x1 to ${to}`);
		};
		move(undefined, 'in-progress');
		move('in-progress', 'review');
		// The "CLI" the hook starts: it records what it was given.
		const seen = join(unit, 'seen.txt');
		const entry = join(unit, 'fake-cli.mjs');
		writeFileSync(
			entry,
			`import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(seen)}, JSON.stringify({ gitDir: process.env.GIT_DIR ?? null, args: process.argv.slice(2) }));\n`,
		);
		const argv = process.argv[1];
		const gitDir = process.env.GIT_DIR;
		process.argv[1] = entry;
		// What git exports to a hook running in the unit's worktree.
		process.env.GIT_DIR = git(tree, 'rev-parse', '--absolute-git-dir');
		const written: string[] = [];
		const spy = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation((chunk: string | Uint8Array) => {
				written.push(String(chunk));
				return true;
			});
		try {
			expect(
				(
					await createGuardCommand().run(
						['post-commit'],
						contextFor(tree),
					)
				).code,
			).toBe(0);
		} finally {
			spy.mockRestore();
			process.argv[1] = argv ?? '';
			if (gitDir === undefined) delete process.env.GIT_DIR;
			else process.env.GIT_DIR = gitDir;
		}
		expect(written.join('')).toContain('left in-progress');
		await vi.waitFor(() => expect(existsSync(seen)).toBe(true), {
			timeout: 10_000,
		});
		const started = JSON.parse(readFileSync(seen, 'utf8')) as {
			gitDir: string | null;
			args: string[];
		};
		expect(started.gitDir).toBeNull();
		expect(started.args).toContain('--proposal=x1');
		expect(started.args).toContain('publish');
	}, 60_000);
});
