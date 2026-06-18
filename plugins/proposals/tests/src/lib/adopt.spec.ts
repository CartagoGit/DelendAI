import { describe, expect, it } from 'vitest';

import { analyzeProposals, type IScanEntry } from '@mcp-vertex/proposals/lib/proposals/adopt';

const md = (
	id: string,
	status: string,
	type = 'proposal'
): { id: string; status: string; type: string } => ({ id, status, type });

describe('analyzeProposals (adoption)', () => {
	it('classifies proposals, fixes, folders, index/readme and unknown markdown', () => {
		const entries: IScanEntry[] = [
			{ name: 'index.json', isDir: false },
			{ name: 'README.md', isDir: false },
			{ name: 'p1-add-login.md', isDir: false, frontmatter: md('p1', 'ready') },
			{ name: 'f2-fix-crash.md', isDir: false, frontmatter: md('f2', 'ready', 'fix') },
			{ name: 'notes.md', isDir: false, frontmatter: null },
			{ name: 'done', isDir: true },
		];
		const r = analyzeProposals('docs/mcp-vertex/proposals', entries);
		expect(r.scan.hasIndex).toBe(true);
		expect(r.scan.hasReadme).toBe(true);
		expect(r.scan.proposals.map((p) => [p.id, p.kind])).toEqual([
			['p1', 'proposal'],
			['f2', 'fix'],
		]);
		expect(r.scan.folders).toEqual(['done']);
		expect(r.scan.unrecognized).toEqual(['notes.md']);
		expect(r.ready).toBe(false); // unrecognized present
		expect(r.plan.join(' ')).toMatch(/notes\.md/);
	});

	it('plans to build the index when missing', () => {
		const r = analyzeProposals('p', [
			{ name: 'p1-x.md', isDir: false, frontmatter: md('p1', 'ready') },
		]);
		expect(r.scan.hasIndex).toBe(false);
		expect(r.plan.join(' ')).toMatch(/sync_proposals/);
	});

	it('suggests archiving completed proposals when there is no done/ folder', () => {
		const r = analyzeProposals('p', [
			{ name: 'index.json', isDir: false },
			{ name: 'p1-x.md', isDir: false, frontmatter: md('p1', 'done') },
		]);
		expect(r.plan.join(' ')).toMatch(/done\/ folder/);
	});

	it('an empty folder is guided to create_proposal; a clean indexed folder is ready', () => {
		expect(analyzeProposals('p', []).plan.join(' ')).toMatch(/create_proposal/);
		const clean = analyzeProposals('p', [
			{ name: 'index.json', isDir: false },
			{ name: 'README.md', isDir: false },
			{ name: 'p1-x.md', isDir: false, frontmatter: md('p1', 'ready') },
		]);
		expect(clean.ready).toBe(true);
	});

	it('exposes the canonical layout for the agent to learn the convention', () => {
		const r = analyzeProposals('p', []);
		expect(r.layout.files['index.json']).toMatch(/registry/);
		expect(r.layout.folders['done/']).toMatch(/completed/);
	});
});
