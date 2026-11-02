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
			'delendai-certify',
		);
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
