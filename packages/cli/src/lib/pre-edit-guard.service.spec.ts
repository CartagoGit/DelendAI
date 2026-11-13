/**
 * pre-edit-guard.service.spec.ts — `delendai guard pre-edit` blocks, with
 * Claude Code's exit code 2, an edit outside the agent's unit worktree
 * (x01003). Real git.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { judgePreEdit } from './pre-edit-guard.service';

const roots: string[] = [];
const AGENT = 'claude-opus-5-5';
const before = process.env.DELENDAI_AGENT_ID;

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
	if (before === undefined) delete process.env.DELENDAI_AGENT_ID;
	else process.env.DELENDAI_AGENT_ID = before;
});

const git = (cwd: string, ...args: string[]): void => {
	execFileSync('git', args, { cwd, stdio: 'ignore' });
};

/** A shared-checkout-pr project where `AGENT` holds one unit. */
const project = (): { readonly root: string; readonly unit: string } => {
	const parent = mkdtempSync(join(tmpdir(), 'pre-edit-'));
	roots.push(parent);
	const root = join(parent, 'repo');
	execFileSync('git', ['init', '-q', '-b', 'develop', root]);
	git(root, 'config', 'user.email', 'pre@example.com');
	git(root, 'config', 'user.name', 'Pre');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'a.ts'), 'export {};\n');
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
	const unit = join(parent, 'unit');
	git(
		root,
		'worktree',
		'add',
		'-q',
		'-b',
		`delendai/wip/${AGENT}/implement/x1-S1-g1/probe`,
		unit,
	);
	return { root, unit };
};

const call = (tool: string, path: string, cwd: string): string =>
	JSON.stringify({ tool_name: tool, tool_input: { file_path: path }, cwd });

describe('delendai guard pre-edit', () => {
	it('blocks Edit and Write into the shared checkout with exit 2, naming the unit worktree', async () => {
		const { root, unit } = project();
		process.env.DELENDAI_AGENT_ID = AGENT;
		for (const tool of ['Edit', 'Write']) {
			const result = await judgePreEdit({
				stdin: call(tool, join(root, 'a.ts'), root),
				workspace: root,
			});
			expect(result.code).toBe(2);
			expect(result.error).toContain('refused');
			expect(result.error).toContain(unit);
		}
	});

	it('lets an edit in the unit worktree, a read-only tool and an unreadable call through', async () => {
		const { root, unit } = project();
		process.env.DELENDAI_AGENT_ID = AGENT;
		const judged = (stdin: string) =>
			judgePreEdit({ stdin, workspace: root });
		expect(
			(await judged(call('Edit', join(unit, 'a.ts'), root))).code,
		).toBe(0);
		expect(
			(await judged(call('Read', join(root, 'a.ts'), root))).code,
		).toBe(0);
		expect((await judged('not json')).code).toBe(0);
	});
});
