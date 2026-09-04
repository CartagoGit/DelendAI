import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';
import { createWorkspacePathProvider } from '@delendai/core/lib/workspace/create-workspace-path-provider';
import { createWorkspaceFileReader } from '@delendai/core/lib/bootstrap/workspace-file-reader';
import { buildInitConfigToolRegistration } from '@delendai/core/lib/bootstrap/init-config-tool';

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

describe('init_config (f00117 S2)', () => {
	let root = '';
	let init: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), 'init-config-'));
		const workspace = createWorkspacePathProvider(root);
		init = await capture(
			buildInitConfigToolRegistration({
				namespacePrefix: 'mcp-vertex',
				workspace,
				reader: createWorkspaceFileReader(workspace),
			}),
		);
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('dry-run by default: returns the derived config without writing', async () => {
		const result = parse(await init({}));
		expect(result.ok).toBe(true);
		expect(result.wrote).toBe(false);
		expect(result.config.plugins).toBeDefined();
		expect(result.rationale.length).toBeGreaterThan(0);
	});

	it('write:true persists mcp-vertex.config.json atomically', async () => {
		const result = parse(await init({ write: true }));
		expect(result.ok).toBe(true);
		expect(result.wrote).toBe(true);
		const written = JSON.parse(
			await readFile(join(root, 'mcp-vertex.config.json'), 'utf8'),
		);
		expect(written.plugins).toBeDefined();
	});

	it('merges an existing config without replacing project preferences', async () => {
		writeFileSync(
			join(root, 'mcp-vertex.config.json'),
			JSON.stringify({
				cacheDir: '.project-cache',
				plugins: {
					search: { enabled: false, options: { roots: ['app'] } },
				},
			}),
			'utf8',
		);
		const result = parse(await init({ write: true }));
		expect(result.ok).toBe(true);
		expect(result.config.cacheDir).toBe('.project-cache');
		expect(result.config.plugins.search.enabled).toBe(false);
		expect(result.config.plugins.search.options.roots).toEqual(['app']);
	});

	it('overwrite:true replaces an existing config', async () => {
		writeFileSync(
			join(root, 'mcp-vertex.config.json'),
			'{"plugins":{}}',
			'utf8',
		);
		const result = parse(await init({ write: true, overwrite: true }));
		expect(result.ok).toBe(true);
		expect(result.wrote).toBe(true);
		const written = JSON.parse(
			await readFile(join(root, 'mcp-vertex.config.json'), 'utf8'),
		);
		expect(Object.keys(written.plugins).length).toBeGreaterThan(0);
	});

	it('refuses to merge a malformed config unless replacement is explicit', async () => {
		writeFileSync(join(root, 'mcp-vertex.config.json'), '{nope', 'utf8');
		const result = parse(await init({ write: true }));
		expect(result.ok).toBe(false);
		expect(result.error.reason).toContain('not valid JSON');
	});

	it('serializes concurrent init_config writes through the file mutex (a00083 F1)', async () => {
		// Two concurrent writers with different `write:true` calls. With
		// the mutex, the second writer reads the first's commit (not
		// a torn snapshot) and produces a valid JSON file. Without the
		// mutex, the two writes race and the on-disk file can be
		// truncated or hold an interleaved JSON.
		const [a, b] = await Promise.all([
			init({ write: true }),
			init({ write: true }),
		]);
		expect(parse(a).ok).toBe(true);
		expect(parse(b).ok).toBe(true);
		const written = JSON.parse(
			await readFile(join(root, 'mcp-vertex.config.json'), 'utf8'),
		);
		expect(written.plugins).toBeDefined();
	});
});
