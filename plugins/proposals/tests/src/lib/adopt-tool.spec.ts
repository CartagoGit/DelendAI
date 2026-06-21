/**
 * l125 s4 — `proposal_adopt`'s outputSchema declared `layout:
 * z.object({}).catchall(z.unknown())`. The actual runtime shape is
 * `PROPOSALS_LAYOUT` (root/files/folders, all string-valued records) —
 * this spec pins the hardened schema against the real registration's
 * structuredContent.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildAdoptRegistration } from '@mcp-vertex/proposals/lib/tools/adopt.tool';

const invoke = async (
	reg: ReturnType<typeof buildAdoptRegistration>,
	args: unknown,
): Promise<{
	content: Array<{ text: string }>;
	structuredContent?: Record<string, unknown>;
}> => {
	let handler:
		| ((a: unknown) => Promise<{
				content: Array<{ text: string }>;
				structuredContent?: Record<string, unknown>;
		  }>)
		| undefined;
	await reg.register({
		registerTool: (
			_name: string,
			_desc: unknown,
			fn: typeof handler,
		): void => {
			handler = fn;
		},
	} as never);
	if (!handler) throw new Error('proposal_adopt did not register a handler');
	return handler(args);
};

describe('proposal_adopt — layout outputSchema (l125 s4)', () => {
	it('returns a golden layout shape: root (string) + files/folders (Record<string,string>)', async () => {
		const workspaceRoot = await mkdtemp(join(tmpdir(), 'adopt-tool-'));
		const proposalsDirAbs = join(
			workspaceRoot,
			'docs',
			'mcp-vertex',
			'proposals',
		);
		await mkdir(proposalsDirAbs, { recursive: true });
		await writeFile(join(proposalsDirAbs, 'index.json'), '{}', 'utf8');
		await writeFile(join(proposalsDirAbs, 'README.md'), '# readme', 'utf8');

		const reg = buildAdoptRegistration({
			namespacePrefix: 'proposals',
			workspaceRoot,
			proposalsDirAbs,
			indexPathAbs: join(proposalsDirAbs, 'index.json'),
			lockPathAbs: join(
				workspaceRoot,
				'.cache/mcp-vertex/agents.lock.json',
			),
			counterPathAbs: join(
				workspaceRoot,
				'.cache/mcp-vertex/counter.json',
			),
		});

		const result = await invoke(reg, {});
		const out = result.structuredContent as {
			layout: {
				root: string;
				files: Record<string, string>;
				folders: Record<string, string>;
			};
		};

		expect(typeof out.layout.root).toBe('string');
		expect(typeof out.layout.files['index.json']).toBe('string');
		expect(out.layout.files['index.json']).toMatch(/registry/);
		expect(typeof out.layout.folders['done/']).toBe('string');
		expect(out.layout.folders['done/']).toMatch(/completed/);
		// No stray keys beyond root/files/folders — confirms the catchall
		// is gone, not just hidden behind a wider record.
		expect(Object.keys(out.layout).sort()).toEqual([
			'files',
			'folders',
			'root',
		]);

		await rm(workspaceRoot, { recursive: true, force: true });
	});
});
