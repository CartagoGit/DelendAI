import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { taskBriefingOf } from '@delendai/proposals/lib/services/task-briefing.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const DOCUMENT = `---
id: f00001
title: "a"
kind: feat
status: ready
type: proposal
---

# f00001

## goal

The goal of it.

## slices

### S1 — First
- **Status**: pending
- **Files**: \`src/a.ts\`, \`src/new.ts\`
- acceptance:
  - "a works"

### S2 — Second
- **Status**: pending
- **Files**: \`src/b.ts\`
- acceptance:
  - "b works"

## acceptance

- a works
`;

const worktree = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'task-briefing-'));
	roots.push(root);
	const write = (path: string, text: string): void => {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	};
	write('docs/ready/feats/f00001-a.md', DOCUMENT);
	write('src/a.ts', '12345');
	write('src/a.spec.ts', '');
	write('src/b.ts', '1');
	return root;
};

const brief = (root: string, slice: string, proposal = 'f00001') =>
	taskBriefingOf({ worktree: root, proposal, slice }, 'docs');

describe('taskBriefingOf', () => {
	it('gives one slice its goal, acceptance, files and spec', async () => {
		expect(await brief(worktree(), 'S1')).toEqual({
			goal: 'The goal of it.',
			slices: [{ id: 'S1', title: 'First', acceptance: ['a works'] }],
			files: [{ path: 'src/a.ts', bytes: 5 }, { path: 'src/new.ts' }],
			specs: ['src/a.spec.ts'],
		});
	});

	it('gives every slice for a unit of the whole proposal', async () => {
		const task = await brief(worktree(), 'all');
		expect(task?.slices.map((slice) => slice.id)).toEqual(['S1', 'S2']);
		expect(task?.files).toHaveLength(3);
	});

	it('has nothing to say about a proposal it cannot find', async () => {
		expect(await brief(worktree(), 'S1', 'x00009')).toBeUndefined();
	});
});
