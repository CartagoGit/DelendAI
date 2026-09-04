import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	findIssues,
	groupByProposal,
	loadBaseline,
	run,
} from './proposal-slice-completeness.script';

describe('proposal-slice-completeness lint', () => {
	let root = '';

	const write = (rel: string, body: string): void => {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'proposal-slice-completeness-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	describe('findIssues', () => {
		it('flags a done proposal with a non-done slice', () => {
			write(
				'docs/delendai/proposals/done/feats/f00001-thing.md',
				'---\nid: f00001\nstatus: done\n---\n\n' +
					'### S1 — thing\n' +
					'- **Status**: pending\n' +
					'- **Files**: `packages/core/src/lib/real.ts`\n' +
					'- **Gate**: e2e\n',
			);
			write('packages/core/src/lib/real.ts', 'export const x = 1;\n');
			const issues = findIssues(root);
			expect(issues).toEqual([
				{
					proposal: 'f00001-thing.md',
					kind: 'pending-slice',
					detail: "S1 status=pending title='thing'",
				},
			]);
		});

		it('flags a done slice whose declared file no longer exists, resolved against root', () => {
			write(
				'docs/delendai/proposals/done/feats/f00002-thing.md',
				'---\nid: f00002\nstatus: done\n---\n\n' +
					'### S1 — thing\n' +
					'- **Status**: done\n' +
					'- **Files**: `packages/core/src/lib/ghost.ts`\n' +
					'- **Gate**: e2e\n',
			);
			const issues = findIssues(root);
			expect(issues).toEqual([
				{
					proposal: 'f00002-thing.md',
					kind: 'missing-file',
					detail: 'S1 declares packages/core/src/lib/ghost.ts (not on disk)',
				},
			]);
		});

		it('passes a fully-shipped done proposal', () => {
			write('packages/core/src/lib/real.ts', 'export const x = 1;\n');
			write(
				'docs/delendai/proposals/done/feats/f00003-thing.md',
				'---\nid: f00003\nstatus: done\n---\n\n' +
					'### S1 — thing\n' +
					'- **Status**: done\n' +
					'- **Files**: `packages/core/src/lib/real.ts`\n' +
					'- **Gate**: e2e\n',
			);
			expect(findIssues(root)).toEqual([]);
		});

		it('ignores proposals that are not status: done', () => {
			write(
				'docs/delendai/proposals/done/feats/f00004-thing.md',
				'---\nid: f00004\nstatus: ready\n---\n\n' +
					'### S1 — thing\n' +
					'- **Status**: pending\n' +
					'- **Files**: `packages/core/src/lib/ghost.ts`\n' +
					'- **Gate**: e2e\n',
			);
			expect(findIssues(root)).toEqual([]);
		});

		it('ignores README.md under done/', () => {
			write('docs/delendai/proposals/done/feats/README.md', '# Index\n');
			expect(findIssues(root)).toEqual([]);
		});
	});

	describe('groupByProposal', () => {
		it('groups issues by their proposal filename, preserving order', () => {
			const grouped = groupByProposal([
				{ proposal: 'a.md', kind: 'pending-slice', detail: 'x' },
				{ proposal: 'b.md', kind: 'missing-file', detail: 'y' },
				{ proposal: 'a.md', kind: 'missing-file', detail: 'z' },
			]);
			expect([...grouped.keys()]).toEqual(['a.md', 'b.md']);
			expect(grouped.get('a.md')?.length).toBe(2);
			expect(grouped.get('b.md')?.length).toBe(1);
		});
	});

	describe('loadBaseline', () => {
		it('returns {} when no baseline file exists', () => {
			expect(loadBaseline(root)).toEqual({});
		});

		it('reads a written baseline back', () => {
			write(
				'tools/scripts/lint/proposal-slice-completeness.baseline.json',
				'{"legacy-thing.md": 3}\n',
			);
			expect(loadBaseline(root)).toEqual({ 'legacy-thing.md': 3 });
		});
	});

	describe('run (ratchet)', () => {
		it('exits 0 when a done proposal is fully shipped and unbaselined', () => {
			write('packages/core/src/lib/real.ts', 'export const x = 1;\n');
			write(
				'docs/delendai/proposals/done/feats/f00005-thing.md',
				'---\nid: f00005\nstatus: done\n---\n\n' +
					'### S1 — thing\n' +
					'- **Status**: done\n' +
					'- **Files**: `packages/core/src/lib/real.ts`\n' +
					'- **Gate**: e2e\n',
			);
			expect(run(root, new Set())).toBe(0);
		});

		it('exits 1 for a new violation with no baseline entry', () => {
			write(
				'docs/delendai/proposals/done/feats/f00006-thing.md',
				'---\nid: f00006\nstatus: done\n---\n\n' +
					'### S1 — thing\n' +
					'- **Status**: pending\n' +
					'- **Files**: `packages/core/src/lib/ghost.ts`\n' +
					'- **Gate**: e2e\n',
			);
			expect(run(root, new Set())).toBe(1);
		});

		it('exits 0 when the violation count is already covered by the baseline', () => {
			write(
				'docs/delendai/proposals/done/feats/f00007-thing.md',
				'---\nid: f00007\nstatus: done\n---\n\n' +
					'### S1 — thing\n' +
					'- **Status**: pending\n' +
					'- **Files**: `packages/core/src/lib/ghost.ts`\n' +
					'- **Gate**: e2e\n',
			);
			write(
				'tools/scripts/lint/proposal-slice-completeness.baseline.json',
				'{"f00007-thing.md": 2}\n',
			);
			expect(run(root, new Set())).toBe(0);
		});

		it('exits 1 when a proposal REGRESSES beyond its baselined count', () => {
			write(
				'docs/delendai/proposals/done/feats/f00008-thing.md',
				'---\nid: f00008\nstatus: done\n---\n\n' +
					'### S1 — thing\n' +
					'- **Status**: pending\n' +
					'- **Files**: `packages/core/src/lib/ghost1.ts`, `packages/core/src/lib/ghost2.ts`\n' +
					'- **Gate**: e2e\n',
			);
			write(
				'tools/scripts/lint/proposal-slice-completeness.baseline.json',
				'{"f00008-thing.md": 1}\n',
			);
			expect(run(root, new Set())).toBe(1);
		});

		it('--update writes the current issue counts as the new baseline', () => {
			write(
				'docs/delendai/proposals/done/feats/f00009-thing.md',
				'---\nid: f00009\nstatus: done\n---\n\n' +
					'### S1 — thing\n' +
					'- **Status**: pending\n' +
					'- **Files**: `packages/core/src/lib/ghost.ts`\n' +
					'- **Gate**: e2e\n',
			);
			expect(run(root, new Set(['--update']))).toBe(0);
			expect(loadBaseline(root)).toEqual({ 'f00009-thing.md': 2 });
		});

		it('--report always exits 0 regardless of drift', () => {
			write(
				'docs/delendai/proposals/done/feats/f00010-thing.md',
				'---\nid: f00010\nstatus: done\n---\n\n' +
					'### S1 — thing\n' +
					'- **Status**: pending\n' +
					'- **Files**: `packages/core/src/lib/ghost.ts`\n' +
					'- **Gate**: e2e\n',
			);
			expect(run(root, new Set(['--report']))).toBe(0);
		});
	});
});

describe('ignored slice files', () => {
	// x00213 S3 declared `.cache/delendai/agent-queue/queue.json`.
	// `git add` refuses a gitignored path and no retry changes
	// .gitignore, so commit-policy re-emitted that slice several times
	// a second for as long as the server ran. The engine now treats it
	// as terminal, but a terminal refusal is still a refusal — the
	// slice can never ship. Catching it while the proposal is written
	// is the only point where it costs nothing to fix.
	it('flags a slice whose declared path .gitignore excludes', () => {
		const root = mkdtempSync(join(tmpdir(), 'slice-ignored-'));
		try {
			execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
			writeFileSync(join(root, '.gitignore'), '.cache/\n');
			const dir = join(
				root,
				'docs',
				'delendai',
				'proposals',
				'ready',
				'fixes',
			);
			mkdirSync(dir, { recursive: true });
			mkdirSync(join(root, '.cache'), { recursive: true });
			writeFileSync(join(root, '.cache', 'queue.json'), '{}');
			writeFileSync(
				join(dir, 'x00001-example.md'),
				[
					'---',
					'id: x00001',
					'status: ready',
					'---',
					'',
					'### S1 — example',
					'- **Status**: pending',
					'- **Files**: `.cache/queue.json`',
					'',
				].join('\n'),
			);
			const issues = findIssues(root);
			expect(
				issues.filter((issue) => issue.kind === 'ignored-file'),
			).toHaveLength(1);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('does not flag a tracked path', () => {
		const root = mkdtempSync(join(tmpdir(), 'slice-tracked-'));
		try {
			execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
			writeFileSync(join(root, '.gitignore'), '.cache/\n');
			const dir = join(
				root,
				'docs',
				'delendai',
				'proposals',
				'ready',
				'fixes',
			);
			mkdirSync(dir, { recursive: true });
			mkdirSync(join(root, 'src'), { recursive: true });
			writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
			writeFileSync(
				join(dir, 'x00002-example.md'),
				[
					'---',
					'id: x00002',
					'status: ready',
					'---',
					'',
					'### S1 — example',
					'- **Status**: pending',
					'- **Files**: `src/a.ts`',
					'',
				].join('\n'),
			);
			expect(
				findIssues(root).filter(
					(issue) => issue.kind === 'ignored-file',
				),
			).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
