/**
 * workflow-kpis.service.spec.ts — the work model reported as numbers
 * from a real repository, and nothing outside one.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readWorkflowKpis } from '@delendai/core/lib/work-units/workflow-kpis.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const UNIT = 'wip/agent-a/implement/x00001-S1-g1/the-work';

const project = () => {
	const base = mkdtempSync(join(tmpdir(), 'workflow-kpis-'));
	roots.push(base);
	const forge = join(base, 'origin.git');
	const root = join(base, 'work');
	execFileSync('git', ['init', '-q', '--bare', '-b', 'develop', forge]);
	execFileSync('git', ['init', '-q', '-b', 'develop', root]);
	const git = (cwd: string, ...args: string[]) =>
		execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
	git(root, 'config', 'user.email', 'work@example.com');
	git(root, 'config', 'user.name', 'Work');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, '.gitignore'), 'units/\n');
	writeFileSync(join(root, 'a.txt'), 'a\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', forge);
	git(root, 'push', '-q', 'origin', 'develop');
	git(root, 'fetch', '-q', 'origin');
	return { root, git };
};

describe('readWorkflowKpis', () => {
	it('is absent outside a git repository', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'workflow-kpis-plain-'));
		roots.push(dir);
		expect(await readWorkflowKpis(dir)).toBeUndefined();
	});

	it('counts a clean repository with no units as an empty run', async () => {
		const { root } = project();
		const kpis = await readWorkflowKpis(root);
		expect(kpis?.units).toBe(0);
		expect(kpis?.publicationsWaiting).toBe(0);
		expect(kpis?.agents).toBe(0);
		expect(kpis?.agentsThatProducedNothing).toBe(0);
		expect(kpis?.invariants.total).toBeGreaterThan(0);
		expect(kpis?.invariants.brokenIds).toHaveLength(
			kpis?.invariants.broken ?? -1,
		);
	});

	it('counts a unit and an agent that produced nothing', async () => {
		const { root, git } = project();
		git(
			root,
			'worktree',
			'add',
			'-q',
			join(root, 'units', 'one'),
			'-b',
			UNIT,
		);
		const kpis = await readWorkflowKpis(root);
		expect(kpis?.units).toBe(1);
		expect(kpis?.agents).toBe(1);
		expect(kpis?.agentsThatProducedNothing).toBe(1);
	});

	it('counts a publication that carries commits the integration branch lacks', async () => {
		const { root, git } = project();
		const unit = join(root, 'units', 'one');
		git(root, 'worktree', 'add', '-q', unit, '-b', UNIT);
		writeFileSync(join(unit, 'b.txt'), 'b\n');
		git(unit, 'add', '-A');
		git(unit, 'commit', '-q', '-m', 'work');
		git(root, 'branch', 'pr/agent-a/implement/x00001-S1-g1/the-work', UNIT);
		const kpis = await readWorkflowKpis(root);
		expect(kpis?.units).toBe(1);
		expect(kpis?.publicationsWaiting).toBe(1);
		expect(kpis?.agentsThatProducedNothing).toBe(0);
	});
});
