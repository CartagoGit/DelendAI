/**
 * post-shell-guard.service.spec.ts — `delendai guard post-shell` rescues
 * what a shell command left in the shared checkout and names the unit
 * worktree; a clean checkout, a non-shell tool or an agent that holds no
 * unit passes in silence (x01052). Real git.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createGitRepoTemplate } from '@delendai/test-kit';

import { judgePostShell } from './post-shell-guard.service';

const AGENT = 'claude-opus-5-5';
const before = process.env.DELENDAI_AGENT_ID;

afterEach(() => {
	if (before === undefined) delete process.env.DELENDAI_AGENT_ID;
	else process.env.DELENDAI_AGENT_ID = before;
});

const template = createGitRepoTemplate({
	trunk: 'develop',
	files: {
		'a.ts': 'export {};\n',
		'delendai.config.json': JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	},
	worktrees: { unit: `delendai/wip/${AGENT}/implement/x1-S1-g1/probe` },
});

/** A shared-checkout-pr project where `AGENT` holds one unit, and no remote. */
const project = (): { readonly root: string; readonly unit: string } => {
	const copy = template.copy();
	return { root: copy.root, unit: copy.worktrees.unit ?? '' };
};

const call = (tool: string, cwd: string): string =>
	JSON.stringify({ tool_name: tool, tool_input: { command: 'x' }, cwd });

describe('delendai guard post-shell', () => {
	it('[<5000ms] rescues a shell write into the shared checkout and names the unit worktree', async () => {
		const { root, unit } = project();
		process.env.DELENDAI_AGENT_ID = AGENT;
		writeFileSync(join(root, 'stray.ts'), 'export const x = 1;\n');
		const result = await judgePostShell({
			stdin: call('Bash', root),
			workspace: root,
		});
		expect(result.code).toBe(2);
		expect(result.error).toContain('stray.ts');
		expect(result.error).toContain(unit);
		expect(
			execFileSync('git', ['status', '--porcelain'], {
				cwd: root,
				encoding: 'utf8',
			}),
		).toBe('');
		expect(() => readFileSync(join(root, 'stray.ts'))).toThrow();
	});

	it('[<5000ms] does nothing for a clean checkout, a non-shell tool, an unreadable call or an agent with no unit', async () => {
		const { root } = project();
		process.env.DELENDAI_AGENT_ID = AGENT;
		const judged = (stdin: string) =>
			judgePostShell({ stdin, workspace: root });
		expect((await judged(call('Bash', root))).code).toBe(0);
		writeFileSync(join(root, 'stray.ts'), 'export {};\n');
		expect((await judged(call('Read', root))).code).toBe(0);
		expect((await judged('not json')).code).toBe(0);
		process.env.DELENDAI_AGENT_ID = 'claude-opus-5-6';
		expect((await judged(call('Bash', root))).code).toBe(0);
		expect(readFileSync(join(root, 'stray.ts'), 'utf8')).toBe(
			'export {};\n',
		);
	});
});
