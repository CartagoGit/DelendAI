/**
 * work-unit-proof.service.spec.ts — a unit is proved before it becomes a
 * pull request, with the proof the integration head declares, on exactly
 * what would be published, and a passing proof is not run twice.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	candidateProofSteps,
	describeFailedProof,
	proofKey,
	proveUnit,
} from '@delendai/core/lib/work-units/work-unit-proof.service';

const roots: string[] = [];

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const repoWith = (files: Readonly<Record<string, string>>): string => {
	const root = mkdtempSync(join(tmpdir(), 'prove-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'prove@example.com');
	git(root, 'config', 'user.name', 'Prove');
	git(root, 'config', 'commit.gpgsign', 'false');
	for (const [path, content] of Object.entries(files)) {
		writeFileSync(join(root, path), content);
	}
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	return root;
};

const PROVING = {
	'package.json': JSON.stringify({ scripts: { prove: 'x', validate: 'y' } }),
	'bun.lock': '',
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('candidateProofSteps', () => {
	it('is the prove script first, then the declared gate, else nothing', () => {
		const files: Record<string, string> = { ...PROVING };
		expect(candidateProofSteps((path) => files[path])).toEqual([
			{ scope: 'prove', command: 'bun run prove' },
		]);
		files['package.json'] = JSON.stringify({ scripts: { validate: 'y' } });
		expect(candidateProofSteps((path) => files[path])).toEqual([
			{ scope: 'package', command: 'bun run validate' },
		]);
		expect(candidateProofSteps(() => undefined)).toEqual([]);
		expect(candidateProofSteps(() => '{not json')).toEqual([]);
	});
});

describe('proveUnit', () => {
	it('runs the proof in the unit worktree, remembers a pass, and does not run it twice', async () => {
		const root = repoWith(PROVING);
		const tip = git(root, 'rev-parse', 'HEAD');
		const ran: string[] = [];
		const run = (command: string, cwd: string) => {
			ran.push(`${command} @ ${cwd}`);
			return { code: 0, output: '' };
		};
		const first = await proveUnit({
			root,
			worktree: root,
			tipSha: tip,
			integrationSha: tip,
			run,
		});
		expect(first).toMatchObject({ declared: true, passed: true });
		expect(first.remembered).toBeUndefined();
		expect(ran).toEqual([`bun run prove @ ${root}`]);

		const again = await proveUnit({
			root,
			worktree: root,
			tipSha: tip,
			integrationSha: tip,
			run,
		});
		expect(again).toMatchObject({ passed: true, remembered: true });
		expect(ran).toHaveLength(1);
	});

	it('fails with the failed step and its output, and remembers nothing', async () => {
		const root = repoWith(PROVING);
		const tip = git(root, 'rev-parse', 'HEAD');
		const failing = await proveUnit({
			root,
			worktree: root,
			tipSha: tip,
			integrationSha: tip,
			run: () => ({ code: 1, output: 'typecheck: 2 errors' }),
		});
		expect(failing.passed).toBe(false);
		const said = describeFailedProof(failing);
		expect(said).toContain('NOT published');
		expect(said).toContain('bun run prove failed');
		expect(said).toContain('typecheck: 2 errors');
		const later = await proveUnit({
			root,
			worktree: root,
			tipSha: tip,
			integrationSha: tip,
			run: () => ({ code: 0, output: '' }),
		});
		expect(later.remembered).toBeUndefined();
	});

	it('refuses a worktree with uncommitted edits, which would not be published', async () => {
		const root = repoWith(PROVING);
		const tip = git(root, 'rev-parse', 'HEAD');
		writeFileSync(join(root, 'loose.ts'), 'export {};\n');
		const report = await proveUnit({
			root,
			worktree: root,
			tipSha: tip,
			integrationSha: tip,
			run: () => ({ code: 0, output: '' }),
		});
		expect(report.passed).toBe(false);
		expect(describeFailedProof(report)).toContain('clean tree');
	});

	it('reads the proof from the integration head, not the unit', async () => {
		const root = repoWith({ 'package.json': '{}' });
		const integration = git(root, 'rev-parse', 'HEAD');
		writeFileSync(
			join(root, 'package.json'),
			JSON.stringify({ scripts: { prove: 'true' } }),
		);
		git(root, 'commit', '-q', '-am', 'the unit declares its own proof');
		const report = await proveUnit({
			root,
			worktree: root,
			tipSha: git(root, 'rev-parse', 'HEAD'),
			integrationSha: integration,
			run: () => ({ code: 0, output: '' }),
		});
		expect(report).toEqual({ declared: false, passed: true, steps: [] });
	});

	it('proves a unit with no worktree in a temporary one, installed first', async () => {
		const root = repoWith(PROVING);
		const tip = git(root, 'rev-parse', 'HEAD');
		const ran: string[] = [];
		const report = await proveUnit({
			root,
			worktree: undefined,
			tipSha: tip,
			integrationSha: tip,
			run: (command) => {
				ran.push(command);
				return { code: 0, output: '' };
			},
		});
		expect(report.passed).toBe(true);
		expect(ran).toEqual(['bun install', 'bun run prove']);
		expect(git(root, 'worktree', 'list')).not.toContain('delendai-prove');
	});

	it('installs nothing for a project with no package manifest', async () => {
		const root = repoWith({
			'delendai.config.json': JSON.stringify({
				validationMatrix: {
					scopes: { unit: [{ command: 'make test' }] },
				},
			}),
		});
		const tip = git(root, 'rev-parse', 'HEAD');
		const ran: string[] = [];
		const report = await proveUnit({
			root,
			worktree: undefined,
			tipSha: tip,
			integrationSha: tip,
			run: (command) => {
				ran.push(command);
				return { code: 0, output: '' };
			},
		});
		expect(report.passed).toBe(true);
		expect(ran).toEqual(['make test']);
	});

	it('says why it could not install, and passes nothing', async () => {
		const root = repoWith(PROVING);
		const tip = git(root, 'rev-parse', 'HEAD');
		const report = await proveUnit({
			root,
			worktree: undefined,
			tipSha: tip,
			integrationSha: tip,
			run: () => ({ code: 1, output: 'no network' }),
		});
		expect(report.passed).toBe(false);
		expect(describeFailedProof(report)).toContain('no network');
	});
});

describe('proofKey', () => {
	it('changes with the tree and with the proof', () => {
		const a = proofKey('t1', [{ command: 'bun run prove' }]);
		expect(proofKey('t1', [{ command: 'bun run prove' }])).toBe(a);
		expect(proofKey('t2', [{ command: 'bun run prove' }])).not.toBe(a);
		expect(proofKey('t1', [{ command: 'bun run validate' }])).not.toBe(a);
	});
});
