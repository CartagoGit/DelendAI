/**
 * proposal-completeness.spec.ts
 *
 * Unit tests for the slice / Files: / status guards that prevent
 * the 2026-07-25 pathology (proposals marked `status: done` while
 * slices still report `pending` or `Files:` don't resolve on disk).
 */
import { describe, expect, it, vi } from 'vitest';

import * as nodeFs from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach } from 'vitest';

import {
	collectSliceStatuses,
	expandDeclaredFiles,
	guardSlicesComplete,
	guardTransitionToDone,
	verifyCompletedProposalAsync,
} from '../../../../src/lib/services/proposal-completeness';

// `node:fs` is a non-configurable ESM namespace, so `vi.spyOn(nodeFs,
// 'statSync')` throws. Automocking with `spy: true` turns each export
// into a spy-backed mock (still delegating to the real implementation)
// so the regression guard below can assert `statSync` is never called.
vi.mock('node:fs', { spy: true });

describe('proposal-completeness — proposal-completeness', () => {
	let workdir: string;

	beforeEach(async () => {
		workdir = await mkdtemp(join(tmpdir(), 'proposal-completeness-'));
		await mkdir(workdir, { recursive: true });
	});

	afterEach(async () => {
		await rm(workdir, { recursive: true, force: true });
	});

	describe('expandDeclaredFiles', () => {
		it('parses a single backticked path', () => {
			expect(expandDeclaredFiles('`a/b.ts`')).toEqual(['a/b.ts']);
		});

		it('parses brace-expanded lists', () => {
			expect(
				expandDeclaredFiles('- **Files**: `dir/{a,b,c}.ts`, `e/f.ts`'),
			).toEqual(['dir/a.ts', 'dir/b.ts', 'dir/c.ts', 'e/f.ts']);
		});

		it('returns empty list when no backticked paths present', () => {
			expect(expandDeclaredFiles('no backticks here')).toEqual([]);
		});
	});

	describe('collectSliceStatuses', () => {
		it('extracts every ### S<n> block with its status + files', () => {
			const md =
				`
### S1 — slice one
- **Files**: \`a/b.ts\`
- **Status**: done

### S2 — slice two
- **Files**: \`dir/{c,d}.ts\`, ` +
				'`e/f.ts`' +
				`
- **Status**: pending
`;
			const slices = collectSliceStatuses(md);
			expect(slices).toHaveLength(2);
			expect(slices[0]).toEqual({
				id: 'S1',
				title: 'slice one',
				status: 'done',
				files: ['a/b.ts'],
			});
			expect(slices[1]!.status).toBe('pending');
			expect(slices[1]!.files).toEqual([
				'dir/c.ts',
				'dir/d.ts',
				'e/f.ts',
			]);
		});

		it('defaults to pending when slice has no Status: line', () => {
			const md = `
### S1 — slice without status
- **Files**: \`a.ts\`
`;
			const slices = collectSliceStatuses(md);
			expect(slices).toHaveLength(1);
			expect(slices[0]!.status).toBe('pending');
		});
	});

	describe('guardSlicesComplete', () => {
		it('returns ok when every slice is done and every file exists', async () => {
			const a = join(workdir, 'a.ts');
			await writeFile(a, '// a');
			const md = `
### S1 — done
- **Files**: \`${a}\`
- **Status**: done
`;
			const result = await guardSlicesComplete({ markdown: md });
			expect(result.ok).toBe(true);
		});

		it('returns incomplete-slices when a slice reports pending', async () => {
			const a = join(workdir, 'a.ts');
			await writeFile(a, '// a');
			const md = `
### S1 — pending slice
- **Files**: \`${a}\`
- **Status**: pending

### S2 — done
- **Files**: \`${a}\`
- **Status**: done
`;
			const result = await guardSlicesComplete({ markdown: md });
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.code).toBe('incomplete-slices');
				expect(result.pendingSlices).toEqual(['S1']);
			}
		});

		it('returns missing-declared-files when a done slice lacks a real file', async () => {
			const missing = join(workdir, 'not-there.ts');
			const md = `
### S1 — claims the file but it does not exist
- **Files**: \`${missing}\`
- **Status**: done
`;
			const result = await guardSlicesComplete({ markdown: md });
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.code).toBe('missing-declared-files');
				expect(result.missingFiles).toContain(missing);
			}
		});

		it('skips file checks for non-done slices (so we dont report files for pending S<n>)', async () => {
			const md = `
### S1 — pending slice with declared but absent file
- **Files**: \`does/not/exist.ts\`
- **Status**: pending
`;
			const result = await guardSlicesComplete({ markdown: md });
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.code).toBe('incomplete-slices');
				expect(result.missingFiles).toEqual([]);
			}
		});

		it('treats a proposal with zero slices as incomplete (not a free pass)', async () => {
			const md = `Just a front-matter; no Slices section.`;
			const result = await guardSlicesComplete({ markdown: md });
			expect(result.ok).toBe(true); // empty plan => no slices to wait on
		});
	});

	describe('guardTransitionToDone', () => {
		it('succeeds for a fully shipped proposal', async () => {
			const a = join(workdir, 'a.ts');
			await writeFile(a, '// a');
			const proposal = join(workdir, 'proposal.md');
			await writeFile(
				proposal,
				`---\nstatus: done\n---\n\n### S1 — done\n- **Files**: \`${a}\`\n- **Status**: done\n`,
			);
			const markdown = await (await import('node:fs/promises')).readFile(
				proposal,
				'utf8',
			);
			const result = await guardTransitionToDone({
				proposalPath: proposal,
				markdown,
			});
			expect(result.ok).toBe(true);
		});

		it('refuses a `status: done` proposal with a pending slice', async () => {
			const proposal = join(workdir, 'proposal.md');
			await writeFile(
				proposal,
				`---\nstatus: done\n---\n\n### S1 — pending\n- **Files**: \`a.ts\`\n- **Status**: pending\n`,
			);
			const markdown = await (await import('node:fs/promises')).readFile(
				proposal,
				'utf8',
			);
			const result = await guardTransitionToDone({
				proposalPath: proposal,
				markdown,
			});
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.code).toBe('incomplete-slices');
			}
		});

		// x00190: both real production entry points used to fall through
		// to a sync `statSync` for every declared file — blocking the
		// event loop on every real `done` transition (a swarm-hot path
		// hit by every agent). They now pre-resolve files with async
		// `stat` and never touch `statSync`.
		it('never calls the sync statSync fallback', async () => {
			const statSyncSpy = vi.mocked(nodeFs.statSync);
			statSyncSpy.mockClear();
			const a = join(workdir, 'a.ts');
			await writeFile(a, '// a');
			const proposal = join(workdir, 'proposal.md');
			await writeFile(
				proposal,
				`---\nstatus: done\n---\n\n### S1 — done\n- **Files**: \`${a}\`\n- **Status**: done\n`,
			);
			const markdown = await (await import('node:fs/promises')).readFile(
				proposal,
				'utf8',
			);
			const result = await guardTransitionToDone({
				proposalPath: proposal,
				markdown,
			});
			expect(result.ok).toBe(true);
			expect(statSyncSpy).not.toHaveBeenCalled();
		});
	});

	describe('verifyCompletedProposalAsync', () => {
		it('succeeds for a fully shipped proposal without sync I/O', async () => {
			const statSyncSpy = vi.mocked(nodeFs.statSync);
			statSyncSpy.mockClear();
			const a = join(workdir, 'a.ts');
			await writeFile(a, '// a');
			const proposal = join(workdir, 'proposal.md');
			await writeFile(
				proposal,
				`---\nstatus: done\n---\n\n### S1 — done\n- **Files**: \`${a}\`\n- **Status**: done\n`,
			);
			const result = await verifyCompletedProposalAsync({
				proposalPath: proposal,
				read: {
					readText: (p) =>
						import('node:fs/promises').then((fs) =>
							fs.readFile(p, 'utf8'),
						),
				},
			});
			expect(result.ok).toBe(true);
			expect(statSyncSpy).not.toHaveBeenCalled();
			statSyncSpy.mockRestore();
		});

		it('reports missing-declared-files for a file that does not exist', async () => {
			const proposal = join(workdir, 'proposal.md');
			await writeFile(
				proposal,
				`---\nstatus: done\n---\n\n### S1 — done\n- **Files**: \`${join(workdir, 'not-there.ts')}\`\n- **Status**: done\n`,
			);
			const result = await verifyCompletedProposalAsync({
				proposalPath: proposal,
				read: {
					readText: (p) =>
						import('node:fs/promises').then((fs) =>
							fs.readFile(p, 'utf8'),
						),
				},
			});
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('missing-declared-files');
		});
	});
});
