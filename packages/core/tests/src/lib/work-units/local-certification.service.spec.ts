/**
 * local-certification.service.spec.ts — the gate that certifies a merge
 * candidate runs on that candidate, from the integration head's
 * declaration, in a worktree of its own, and fails closed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { certifyCandidate } from '@delendai/core/lib/work-units/local-certification.service';
import { validationGateSteps } from '@delendai/core/lib/work-units/validation-gate-steps.service';

const roots: string[] = [];

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const repoWith = (files: Readonly<Record<string, string>>): string => {
	const root = mkdtempSync(join(tmpdir(), 'certify-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'certify@example.com');
	git(root, 'config', 'user.name', 'Certify');
	git(root, 'config', 'commit.gpgsign', 'false');
	for (const [path, content] of Object.entries(files)) {
		writeFileSync(join(root, path), content);
	}
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	return root;
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('validationGateSteps', () => {
	it('reads the matrix first, then the validate script under the lockfile’s manager', () => {
		const files: Record<string, string> = {
			'package.json': JSON.stringify({ scripts: { validate: 'x' } }),
			'pnpm-lock.yaml': '',
		};
		expect(validationGateSteps((path) => files[path])).toEqual([
			{ scope: 'package', command: 'pnpm run validate' },
		]);
		files['delendai.config.json'] = JSON.stringify({
			validationMatrix: { scopes: { unit: [{ command: 'make test' }] } },
		});
		expect(validationGateSteps((path) => files[path])).toEqual([
			{ scope: 'unit', command: 'make test' },
		]);
	});

	it('declares nothing when the project declares nothing', () => {
		expect(validationGateSteps(() => undefined)).toEqual([]);
	});
});

describe('certifyCandidate', () => {
	it('runs every step in a worktree of the candidate, and removes it', async () => {
		const root = repoWith({
			'delendai.config.json': JSON.stringify({
				validationMatrix: {
					scopes: {
						a: [{ command: 'first' }],
						b: [{ command: 'second' }],
					},
				},
			}),
		});
		const head = git(root, 'rev-parse', 'HEAD');
		const ran: { command: string; cwd: string; tree: string }[] = [];

		const report = await certifyCandidate({
			root,
			candidateSha: head,
			integrationSha: head,
			run: (command, cwd) => {
				ran.push({ command, cwd, tree: git(cwd, 'rev-parse', 'HEAD') });
				return command === 'first'
					? { code: 0, output: '' }
					: { code: 2, output: 'line\nwhy it failed\n' };
			},
		});

		expect(ran.map((entry) => entry.command)).toEqual(['first', 'second']);
		expect(ran.every((entry) => entry.tree === head)).toBe(true);
		expect(ran[0]?.cwd).not.toBe(root);
		expect(report).toMatchObject({
			declared: true,
			passed: false,
			againstIntegrationSha: head,
			candidateSha: head,
		});
		expect(report.steps[1]?.outputTail).toContain('why it failed');
		expect(git(root, 'worktree', 'list', '--porcelain')).not.toContain(
			'.cache/delendai/certify',
		);
	});

	it('puts the worktree inside the repository but outside any .git directory', async () => {
		const root = repoWith({
			'delendai.config.json': JSON.stringify({
				validationMatrix: { scopes: { a: [{ command: 'first' }] } },
			}),
		});
		const head = git(root, 'rev-parse', 'HEAD');
		const cwdUsed: string[] = [];

		await certifyCandidate({
			root,
			candidateSha: head,
			integrationSha: head,
			run: (_command, cwd) => {
				cwdUsed.push(cwd);
				return { code: 0, output: '' };
			},
		});

		const cwd = cwdUsed[0] ?? '';
		expect(cwd).not.toBe('');
		// Inside the repository: `node_modules` must stay reachable by
		// walking up, or the gate cannot resolve a single dependency.
		expect(cwd.startsWith(root)).toBe(true);
		// Outside every `.git` directory: bundlers deny serving files under
		// `**/.git/**`, so a suite run there cannot load the project's own
		// setup files.
		expect(cwd.split('/').includes('.git')).toBe(false);
	});

	it('certifies nothing when the integration head declares no gate', async () => {
		const root = repoWith({ 'README.md': '# none\n' });
		const head = git(root, 'rev-parse', 'HEAD');
		const report = await certifyCandidate({
			root,
			candidateSha: head,
			integrationSha: head,
			run: () => ({ code: 0, output: '' }),
		});
		expect(report).toMatchObject({ declared: false, passed: false });
	});

	it('runs the gate with the default runner when the caller names none', async () => {
		const root = repoWith({
			'delendai.config.json': JSON.stringify({
				validationMatrix: { scopes: { a: [{ command: 'true' }] } },
			}),
		});
		const head = git(root, 'rev-parse', 'HEAD');

		// No `run`: the default runner shells out. `true` exits 0, so the
		// candidate certifies.
		const report = await certifyCandidate({
			root,
			candidateSha: head,
			integrationSha: head,
		});

		expect(report.declared).toBe(true);
		expect(report.passed).toBe(true);
		expect(report.steps[0]?.passed).toBe(true);
	});

	it('keeps the failure detail of a step that produced no output', async () => {
		const root = repoWith({
			'delendai.config.json': JSON.stringify({
				validationMatrix: { scopes: { a: [{ command: 'first' }] } },
			}),
		});
		const head = git(root, 'rev-parse', 'HEAD');

		const report = await certifyCandidate({
			root,
			candidateSha: head,
			integrationSha: head,
			run: () => ({ code: 2, output: '   ' }),
		});

		expect(report.passed).toBe(false);
		expect(report.steps[0]?.passed).toBe(false);
		// Output that is only whitespace carries no tail worth keeping.
		expect(report.steps[0]?.outputTail).toBeUndefined();
	});

	it('fails closed when the root is not a git working tree', async () => {
		// A bare repository has no working tree: `rev-parse --show-toplevel`
		// refuses. The gate can read the declaration (the objects are
		// there) but cannot put the candidate anywhere, so it must report
		// the failure instead of reporting a pass.
		const source = repoWith({
			'delendai.config.json': JSON.stringify({
				validationMatrix: { scopes: { a: [{ command: 'true' }] } },
			}),
		});
		const head = git(source, 'rev-parse', 'HEAD');

		const bare = mkdtempSync(join(tmpdir(), 'certify-bare-'));
		roots.push(bare);
		git(bare, 'init', '-q', '--bare', '.');
		git(bare, 'fetch', '-q', `${source}/.git`, `${head}:refs/heads/main`);

		const report = await certifyCandidate({
			root: bare,
			candidateSha: head,
			integrationSha: head,
			run: () => ({ code: 0, output: '' }),
		});

		expect(report.passed).toBe(false);
		expect(report.setupFailure).toContain(
			'could not locate the git working tree',
		);
	});

	it('fails closed when the candidate cannot be put on disk', async () => {
		const root = repoWith({
			'delendai.config.json': JSON.stringify({
				validationMatrix: { scopes: { a: [{ command: 'true' }] } },
			}),
		});
		const head = git(root, 'rev-parse', 'HEAD');
		const report = await certifyCandidate({
			root,
			candidateSha: 'f'.repeat(40),
			integrationSha: head,
		});
		expect(report.passed).toBe(false);
		expect(report.setupFailure).toContain('could not put');
	});
});
