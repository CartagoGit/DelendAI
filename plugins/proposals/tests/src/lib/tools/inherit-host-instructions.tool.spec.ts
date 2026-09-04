/**
 * inherit-host-instructions.tool.spec.ts — f00094 S3/S4.
 *
 * Drives the registered `inherit_host_instructions` handler end to end
 * against a tmpdir workspace + in-memory readers: the empty/soft-fail
 * path, the write path (proposal lands at an allocated id, carries the
 * captured payload + scope tag), allocation continuity, and the opt-in
 * user-home scope.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IFileReader, IToolRegistration } from '@delendai/core/public';

import { buildInheritHostInstructionsRegistration } from '@delendai/proposals/lib/tools/inherit-host-instructions.tool';
import type { IInheritHostInstructionsToolOptions } from '@delendai/proposals/lib/contracts/interfaces/inherit-host-instructions-options.interface';
import type { IUserHomeReader } from '@delendai/proposals/lib/contracts/interfaces/host-instructions-inventory.interface';

const capture = async (
	reg: IToolRegistration,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h!;
};

const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

const fakeRepoReader = (files: Record<string, string>): IFileReader => ({
	readFile: async (relativePath) =>
		relativePath in files ? files[relativePath] : undefined,
	exists: async (relativePath) => relativePath in files,
	listDir: async () => [],
});

const fakeHomeReader = (files: Record<string, string>): IUserHomeReader => ({
	readHome: async (relativeToHome) =>
		relativeToHome in files ? files[relativeToHome] : undefined,
});

const MCP_BLOCK =
	'<!-- mcp-vertex:begin -->\n# mcp-vertex\n<!-- mcp-vertex:end -->';

describe('inherit_host_instructions', () => {
	let root = '';
	const proposalsRel = 'docs/mcp-vertex/proposals';

	const buildOptions = (
		reader: IFileReader,
		home?: IUserHomeReader,
	): IInheritHostInstructionsToolOptions => ({
		namespacePrefix: 'proposals',
		workspaceRoot: root,
		reader,
		proposalsDirAbs: join(root, proposalsRel),
		counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
		layout: {
			proposalsDir: proposalsRel,
			proposalIndexFile: '.cache/mcp-vertex/proposals/index.json',
		},
		...(home ? { homeReader: home } : {}),
	});

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'inherit-hi-'));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('returns {files:[], id:null} and writes nothing when all files are absent', async () => {
		const handler = await capture(
			buildInheritHostInstructionsRegistration(
				buildOptions(fakeRepoReader({})),
			),
		);
		const res = parse(await handler({ workspaceRoot: '/ws' }));
		expect(res.ok).toBe(true);
		expect(res.files).toEqual([]);
		expect(res.id).toBeNull();
		expect(res.totalNonCanonical).toBe(0);
		expect(existsSync(join(root, proposalsRel))).toBe(false);
	});

	it('skips a file that is already mcp-vertex-managed (no proposal)', async () => {
		const handler = await capture(
			buildInheritHostInstructionsRegistration(
				buildOptions(fakeRepoReader({ 'AGENTS.md': MCP_BLOCK })),
			),
		);
		const res = parse(await handler({ workspaceRoot: '/ws' }));
		expect(res.files).toEqual([]);
		expect(res.id).toBeNull();
	});

	it('emits a ready proposal capturing a foreign in-repo file (scope tag in-repo)', async () => {
		const handler = await capture(
			buildInheritHostInstructionsRegistration(
				buildOptions(
					fakeRepoReader({
						'CLAUDE.md': 'ALWAYS run the linter first',
					}),
				),
			),
		);
		const res = parse(await handler({ workspaceRoot: '/ws/my-repo' }));

		expect(res.ok).toBe(true);
		expect(res.id).toMatch(/^f\d{5}$/);
		expect(res.files).toHaveLength(1);
		expect(res.file).toMatch(
			/^ready\/feats\/f\d{5}-inherit-host-instructions-.+\.md$/,
		);

		const body = readFileSync(join(root, proposalsRel, res.file), 'utf8');
		expect(body).toContain('*scope*: `in-repo`');
		expect(body).toContain('ALWAYS run the linter first');
		expect(body).toContain(`id: ${res.id}`);
		expect(body).toContain('status: ready');
	});

	it('allocates via the shared counter, never a hardcoded f00001', async () => {
		const first = parse(
			await (
				await capture(
					buildInheritHostInstructionsRegistration(
						buildOptions(
							fakeRepoReader({ 'CLAUDE.md': 'rule one' }),
						),
					),
				)
			)({ workspaceRoot: '/ws' }),
		);
		const second = parse(
			await (
				await capture(
					buildInheritHostInstructionsRegistration(
						buildOptions(
							fakeRepoReader({ 'CLAUDE.md': 'rule two' }),
						),
					),
				)
			)({ workspaceRoot: '/ws' }),
		);
		const num = (id: string): number => Number(id.slice(1));
		expect(num(second.id)).toBe(num(first.id) + 1);
	});

	it('scope "all" captures an opt-in user-home file via the injected home reader', async () => {
		const handler = await capture(
			buildInheritHostInstructionsRegistration(
				buildOptions(
					fakeRepoReader({}),
					fakeHomeReader({ '.cursorrules': 'prefer 2-space indent' }),
				),
			),
		);
		const res = parse(
			await handler({ workspaceRoot: '/ws', scope: 'all' }),
		);
		expect(res.ok).toBe(true);
		expect(res.scope).toBe('all');
		expect(res.id).toMatch(/^f\d{5}$/);

		const body = readFileSync(join(root, proposalsRel, res.file), 'utf8');
		expect(body).toContain('~/.cursorrules');
		expect(body).toContain('prefer 2-space indent');
		expect(body).toContain('*surface*: user-home');
	});

	it('scope "repo" never reads the home reader', async () => {
		let homeCalls = 0;
		const spyHome: IUserHomeReader = {
			readHome: async () => {
				homeCalls += 1;
				return undefined;
			},
		};
		const handler = await capture(
			buildInheritHostInstructionsRegistration(
				buildOptions(fakeRepoReader({ 'AGENTS.md': 'x' }), spyHome),
			),
		);
		await handler({ workspaceRoot: '/ws', scope: 'repo' });
		expect(homeCalls).toBe(0);
	});
});
