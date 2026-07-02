/**
 * scan-host-instructions.tool.spec.ts — f00094 S2/S4.
 *
 * Drives the pure `scanHostInstructions` against in-memory readers so
 * every scope + presence + canonical combination is asserted without
 * touching the real filesystem. Also covers the `createUserHomeReader`
 * containment guard.
 */
import { describe, expect, it, vi } from 'vitest';

import {
	createUserHomeReader,
	scanHostInstructions,
} from '@mcp-vertex/proposals/lib/tools/scan-host-instructions.tool';
import type { IFileReader } from '@mcp-vertex/core/public';
import type {
	IHostInstructionFile,
	IUserHomeReader,
} from '@mcp-vertex/proposals/lib/contracts/interfaces/host-instructions-inventory.interface';

/** In-memory `IFileReader` over a `{ relPath: content }` map. */
const fakeRepoReader = (files: Record<string, string>): IFileReader => ({
	readFile: async (relativePath) =>
		relativePath in files ? files[relativePath] : undefined,
	exists: async (relativePath) => relativePath in files,
	listDir: async () => [],
});

/** In-memory `IUserHomeReader` over a `{ homeRelPath: content }` map. */
const fakeHomeReader = (files: Record<string, string>): IUserHomeReader => ({
	readHome: async (relativeToHome) =>
		relativeToHome in files ? files[relativeToHome] : undefined,
});

const MCP_BLOCK =
	'<!-- mcp-vertex:begin -->\n# mcp-vertex host hints\n<!-- mcp-vertex:end -->';

const byPath = (
	files: readonly IHostInstructionFile[],
	path: string,
): IHostInstructionFile => {
	const f = files.find((x) => x.path === path);
	if (f === undefined) throw new Error(`no captured file for ${path}`);
	return f;
};

describe('scanHostInstructions', () => {
	it('scope "repo" reads only the three in-repo files, never the home reader', async () => {
		const home = { readHome: vi.fn(async () => undefined) };
		const inv = await scanHostInstructions(
			{
				repo: fakeRepoReader({ 'AGENTS.md': 'do the thing' }),
				home,
			},
			{ scope: 'repo' },
		);

		expect(inv.scope).toBe('repo');
		expect(inv.files).toHaveLength(3);
		expect(inv.files.every((f) => f.surface === 'in-repo')).toBe(true);
		expect(inv.files.map((f) => f.path)).toEqual([
			'AGENTS.md',
			'CLAUDE.md',
			'.github/copilot-instructions.md',
		]);
		expect(home.readHome).not.toHaveBeenCalled();
	});

	it('marks a missing in-repo file present:false with empty content', async () => {
		const inv = await scanHostInstructions(
			{ repo: fakeRepoReader({ 'AGENTS.md': 'rule' }) },
			{ scope: 'repo' },
		);
		const claude = byPath(inv.files, 'CLAUDE.md');
		expect(claude.present).toBe(false);
		expect(claude.content).toBe('');
		expect(claude.canonical).toBe(false);
	});

	it('flags a file carrying the mcp-vertex markers as canonical (not counted)', async () => {
		const inv = await scanHostInstructions(
			{ repo: fakeRepoReader({ 'AGENTS.md': MCP_BLOCK }) },
			{ scope: 'repo' },
		);
		const agents = byPath(inv.files, 'AGENTS.md');
		expect(agents.present).toBe(true);
		expect(agents.canonical).toBe(true);
		expect(inv.totalNonCanonical).toBe(0);
	});

	it('counts a present, non-canonical in-repo file', async () => {
		const inv = await scanHostInstructions(
			{ repo: fakeRepoReader({ 'CLAUDE.md': 'custom project rule' }) },
			{ scope: 'repo' },
		);
		const claude = byPath(inv.files, 'CLAUDE.md');
		expect(claude.present).toBe(true);
		expect(claude.canonical).toBe(false);
		expect(inv.totalNonCanonical).toBe(1);
	});

	it('scope "all" additionally captures present user-home files (~/ prefixed)', async () => {
		const inv = await scanHostInstructions(
			{
				repo: fakeRepoReader({}),
				home: fakeHomeReader({ '.cursorrules': 'always use tabs' }),
			},
			{ scope: 'all' },
		);
		expect(inv.files).toHaveLength(3 + 5);
		const cursor = byPath(inv.files, '~/.cursorrules');
		expect(cursor.surface).toBe('user-home');
		expect(cursor.present).toBe(true);
		expect(cursor.canonical).toBe(false);
		expect(cursor.content).toBe('always use tabs');
	});

	it('scope "all" with a missing user-home file returns present:false, never throws', async () => {
		const inv = await scanHostInstructions(
			{ repo: fakeRepoReader({}), home: fakeHomeReader({}) },
			{ scope: 'all' },
		);
		expect(inv.files.filter((f) => f.surface === 'user-home')).toHaveLength(
			5,
		);
		expect(
			inv.files
				.filter((f) => f.surface === 'user-home')
				.every((f) => !f.present),
		).toBe(true);
	});

	it('scope "all" with NO home reader degrades user-home to present:false', async () => {
		const inv = await scanHostInstructions(
			{ repo: fakeRepoReader({ 'AGENTS.md': 'x' }) },
			{ scope: 'all' },
		);
		expect(inv.files).toHaveLength(3 + 5);
		expect(
			inv.files
				.filter((f) => f.surface === 'user-home')
				.every((f) => !f.present && f.content === ''),
		).toBe(true);
	});

	it('totalNonCanonical counts present && !canonical across both surfaces', async () => {
		const inv = await scanHostInstructions(
			{
				repo: fakeRepoReader({
					'AGENTS.md': MCP_BLOCK, // canonical → not counted
					'CLAUDE.md': 'foreign rule', // counted
				}),
				home: fakeHomeReader({ '.aider.conf.yml': 'model: gpt-4' }), // counted
			},
			{ scope: 'all' },
		);
		expect(inv.totalNonCanonical).toBe(2);
	});
});

describe('createUserHomeReader', () => {
	it('rejects an absolute path (table paths are home-relative)', async () => {
		const reader = createUserHomeReader('/home/tester');
		expect(await reader.readHome('/etc/passwd')).toBeUndefined();
	});

	it('rejects a traversal path that escapes the home root', async () => {
		const reader = createUserHomeReader('/home/tester');
		expect(await reader.readHome('../../etc/passwd')).toBeUndefined();
	});

	it('returns undefined for an absent in-home file instead of throwing', async () => {
		const reader = createUserHomeReader('/home/tester');
		expect(
			await reader.readHome('.definitely-not-here-f00094'),
		).toBeUndefined();
	});
});
