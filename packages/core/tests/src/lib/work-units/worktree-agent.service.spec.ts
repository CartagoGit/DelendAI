/**
 * An agent is known by the worktree delendai made for it (x00688).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	stampWorktreeAgent,
	worktreeAgent,
} from '@delendai/core/lib/work-units/worktree-agent.service';

let root = '';

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'worktree-agent-'));
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, stdio: 'ignore' });
	git('init', '-q', '-b', 'develop');
	git('config', 'user.email', 'a@example.com');
	git('config', 'user.name', 'A');
	git('commit', '-q', '--allow-empty', '--no-verify', '-m', 'base');
	git('worktree', 'add', '-q', '-b', 'wip/x', join(root, 'unit'));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe('worktree agent', () => {
	it('names the agent in the worktree it was stamped for, and only there', () => {
		expect(worktreeAgent(join(root, 'unit'))).toBeUndefined();
		expect(stampWorktreeAgent(join(root, 'unit'), 'glm-5')).toBe(true);
		expect(worktreeAgent(join(root, 'unit'))).toBe('glm-5');
		expect(worktreeAgent(root)).toBeUndefined();
	});

	it('never stamps the shared checkout, where a person works', () => {
		expect(stampWorktreeAgent(root, 'glm-5')).toBe(false);
		expect(worktreeAgent(root)).toBeUndefined();
	});
});
