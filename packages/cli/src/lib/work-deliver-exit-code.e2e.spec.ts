/**
 * work-deliver-exit-code.e2e.spec.ts — the verdict of `work deliver` and
 * `work prove` is the exit code of the CLI process, not only a field of
 * an answer: run as a child process in a throwaway repository.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { knownFailingNoteOf } from '@delendai/core/lib/integration/land/known-failing-note.helper';

const ENTRY = resolve(__dirname, '..', 'index.ts');
const UNIT_REF = 'delendai/wip/agent-a/implement/x00001-S1-g1/probe';
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string => {
	const run = spawnSync('git', args, { cwd, encoding: 'utf8' });
	return run.stdout.trim();
};

/** A repository whose proof prints a failing spec, and a unit that adds `b.ts`. */
const repo = (): { root: string; unit: string; base: string } => {
	const parent = mkdtempSync(join(tmpdir(), 'deliver-exit-'));
	roots.push(parent);
	const root = join(parent, 'repo');
	git(parent, 'init', '-q', '-b', 'develop', root);
	git(root, 'config', 'user.email', 'work@example.com');
	git(root, 'config', 'user.name', 'Work');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(
		join(root, 'package.json'),
		JSON.stringify({
			name: 'probe',
			private: true,
			scripts: { prove: 'echo FAIL a/old.spec.ts; exit 1' },
		}),
	);
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	const base = git(root, 'rev-parse', 'HEAD');
	const unit = join(parent, 'unit');
	git(root, 'worktree', 'add', '-q', '-b', UNIT_REF, unit);
	writeFileSync(join(unit, 'b.ts'), 'export {};\n');
	git(unit, 'add', '-A');
	git(unit, 'commit', '-q', '-m', 'unit');
	return { root, unit, base };
};

const cli = (cwd: string, ...args: string[]) => {
	const run = spawnSync('bun', [ENTRY, 'work', ...args], {
		cwd,
		encoding: 'utf8',
		env: { ...process.env, DELENDAI_AGENT_ID: 'agent-a' },
	});
	return { code: run.status, out: `${run.stdout}${run.stderr}` };
};

const UNIT_ARGS = ['--proposal=x00001', '--slice=S1', '--agent=agent-a'];

describe('the exit code of the work CLI', () => {
	it('[<60000ms] work deliver exits non-zero and never says delivered when it fails', () => {
		const { unit } = repo();
		const run = cli(unit, 'deliver', ...UNIT_ARGS);
		expect(run.code).not.toBe(0);
		expect(run.out).not.toMatch(/delivered/iu);
	}, 60_000);

	it('[<60000ms] work deliver exits 4 when it is refused for its arguments', () => {
		const { unit } = repo();
		const run = cli(unit, 'deliver', '--agent=agent-a');
		expect(run.code).toBe(4);
		expect(run.out).not.toMatch(/delivered/iu);
	}, 60_000);

	it('[<60000ms] work prove exits non-zero when the proof fails', () => {
		const { unit } = repo();
		const run = cli(unit, 'prove', ...UNIT_ARGS);
		expect(run.code).not.toBe(0);
	}, 60_000);

	it('[<60000ms] work prove passes only a failure develop already knows, and names baseFailures', () => {
		const { root, unit, base } = repo();
		const note = knownFailingNoteOf({
			namespace: 'delendai',
			commit: base,
			failingSpecs: ['a/old.spec.ts'],
		});
		git(
			root,
			'notes',
			`--ref=${note.ref}`,
			'add',
			'-m',
			note.content,
			note.commit,
		);
		const run = cli(unit, 'prove', ...UNIT_ARGS, '--json');
		expect(run.code).toBe(0);
		expect(run.out).toContain('baseFailures');
	}, 60_000);
});
