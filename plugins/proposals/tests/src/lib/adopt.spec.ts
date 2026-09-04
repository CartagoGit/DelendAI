import { describe, expect, it } from 'vitest';

import {
	analyzeProposals,
	type IScanEntry,
} from '@delendai/proposals/lib/proposals/adopt';

const md = (
	id: string,
	status: string,
	type = 'proposal',
): { id: string; status: string; type: string } => ({ id, status, type });

describe('analyzeProposals (adoption)', async () => {
	it('classifies proposals, fixes, folders, index/readme and unknown markdown', async () => {
		const entries: IScanEntry[] = [
			{ name: 'README.md', isDir: false },
			{
				name: 'p1-add-login.md',
				isDir: false,
				frontmatter: md('p1', 'ready'),
			},
			{
				name: 'f2-fix-crash.md',
				isDir: false,
				frontmatter: md('f2', 'ready', 'fix'),
			},
			{ name: 'notes.md', isDir: false, frontmatter: null },
			{ name: 'done', isDir: true },
		];
		// x00209: hasIndex is the caller-observed cache index (3rd arg),
		// not a top-level index.json inside the folder.
		const r = analyzeProposals('docs/mcp-vertex/proposals', entries, true);
		expect(r.scan.hasIndex).toBe(true);
		expect(r.scan.hasReadme).toBe(true);
		expect(r.scan.proposals.map((p) => [p.id, p.kind])).toEqual([
			['p1', 'legacy'],
			['f2', 'fix'],
		]);
		expect(r.scan.folders).toEqual(['done']);
		expect(r.scan.unrecognized).toEqual(['notes.md']);
		expect(r.ready).toBe(false); // unrecognized + missing canonical folders
		expect(r.plan.join(' ')).toMatch(/notes\.md/);
	});

	it('resolves the canonical kind from the filename prefix (f=feat, x=fix)', async () => {
		const r = analyzeProposals('p', [
			{
				name: 'x00100-fix.md',
				isDir: false,
				frontmatter: md('x00100', 'ready'),
			},
			{
				name: 'f00101-add.md',
				isDir: false,
				frontmatter: md('f00101', 'ready'),
			},
		]);
		expect(r.scan.proposals.map((p) => [p.id, p.kind])).toEqual([
			['x00100', 'fix'],
			['f00101', 'feat'],
		]);
	});

	it('classifies proposals nested under status folders and does not misflag archived ones', async () => {
		const r = analyzeProposals(
			'p',
			[
				{ name: 'done', isDir: true },
				{
					name: 'done/f00100-x.md',
					isDir: false,
					frontmatter: md('f00100', 'done'),
				},
			],
			true,
		);
		expect(r.scan.proposals).toEqual([
			{
				file: 'done/f00100-x.md',
				id: 'f00100',
				kind: 'feat',
				status: 'done',
			},
		]);
		// Already archived under done/ → no "move into done/" plan.
		expect(r.plan.join(' ')).not.toMatch(/into done\//);
	});

	it('plans to build the index when missing', async () => {
		const r = analyzeProposals('p', [
			{ name: 'p1-x.md', isDir: false, frontmatter: md('p1', 'ready') },
		]);
		expect(r.scan.hasIndex).toBe(false);
		expect(r.plan.join(' ')).toMatch(/sync_proposals/);
	});

	it('suggests archiving completed proposals when they are not under done/', async () => {
		const r = analyzeProposals(
			'p',
			[
				{
					name: 'p1-x.md',
					isDir: false,
					frontmatter: md('p1', 'done'),
				},
			],
			true,
		);
		expect(r.plan.join(' ')).toMatch(/into done\//);
	});

	it('an empty folder is guided to create_proposal; a clean indexed folder is ready', async () => {
		expect(analyzeProposals('p', []).plan.join(' ')).toMatch(
			/create_proposal/,
		);
		const clean = analyzeProposals(
			'p',
			[
				{ name: 'README.md', isDir: false },
				{ name: 'ready', isDir: true },
				{ name: 'in-progress', isDir: true },
				{ name: 'review', isDir: true },
				{ name: 'done', isDir: true },
				{ name: 'paused', isDir: true },
				{ name: 'blocked', isDir: true },
				{ name: 'retired', isDir: true },
				{
					name: 'ready/f00100-x.md',
					isDir: false,
					frontmatter: md('f00100', 'ready'),
				},
			],
			true,
		);
		expect(clean.ready).toBe(true);
	});

	it('exposes the canonical layout for the agent to learn the convention', async () => {
		const r = analyzeProposals('p', []);
		expect(r.layout.files['index.json']).toMatch(/registry/);
		expect(r.layout.folders['done/']).toMatch(/completed/);
	});
});
