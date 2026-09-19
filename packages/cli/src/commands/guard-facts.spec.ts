/**
 * guard-facts.spec.ts — what the guard reads from real git and the
 * project's configuration, in-process.
 *
 * The hook-level spec proves the wiring through a subprocess; this proves
 * each fact against a real repository, including the ones that decide
 * whether anything is enforced at all.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

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

	it('enforces nothing without a configuration or a development block', async () => {
		const bare = repo();
		expect(await defaultGuardFacts(bare).policy(bare)).toBeUndefined();
		const noBlock = repo('{ "plugins": {} }');
		expect(
			await defaultGuardFacts(noBlock).policy(noBlock),
		).toBeUndefined();
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
	it('answers offline, refusing a commit on develop under the policy', async () => {
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
		// pre-commit, reference-transaction, pre-push and post-checkout.
		expect(envelope.hooks).toHaveLength(4);
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
