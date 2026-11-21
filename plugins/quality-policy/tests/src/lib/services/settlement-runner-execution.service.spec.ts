/**
 * settlement-runner-execution.service.spec.ts — the declared script is
 * run with bounded retries, and the outcome names the head or the
 * failing files.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runSettlement } from '../../../../src/lib/services/settlement-runner';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): void => {
	execFileSync('git', args, { cwd, stdio: 'ignore' });
};

const project = (scripts: Record<string, string>): string => {
	const root = mkdtempSync(join(tmpdir(), 'settlement-exec-'));
	roots.push(root);
	writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }));
	git(root, 'init', '-q');
	git(root, 'add', '.');
	git(
		root,
		'-c',
		'user.name=t',
		'-c',
		'user.email=t@example.com',
		'-c',
		'commit.gpgsign=false',
		'commit',
		'-q',
		'-m',
		'init',
	);
	return root;
};

describe('runSettlement execution', () => {
	it('reports green with the head sha when the script passes', async () => {
		const outcome = await runSettlement({
			cwd: project({ validate: 'true' }),
		});
		expect(outcome).toMatchObject({ green: true, attempts: 1 });
		expect(outcome.green ? outcome.headSha : '').toMatch(/^[0-9a-f]+$/u);
	});

	it('retries, then names the failing files from the output', async () => {
		const sleeps: number[] = [];
		const outcome = await runSettlement({
			cwd: project({
				check: 'echo "src/a.ts(1,2): error" >&2; echo "not a file" >&2; exit 1',
			}),
			validateCommand: 'bun run check',
			maxAttempts: 2,
			backoffMs: (attempt) => {
				sleeps.push(attempt);
				return 0;
			},
		});
		expect(sleeps).toEqual([1]);
		expect(outcome).toMatchObject({
			green: false,
			attempts: 2,
			failingFiles: ['src/a.ts'],
		});
		expect(outcome.green ? '' : outcome.lastError).toContain('src/a.ts');
	});

	it('does not run when package.json is unreadable', async () => {
		const root = mkdtempSync(join(tmpdir(), 'settlement-none-'));
		roots.push(root);
		const outcome = await runSettlement({ cwd: root });
		expect(outcome).toMatchObject({ green: false, attempts: 0 });
	});
});
