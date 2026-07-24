import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { createWorkspacePathProvider } from '@mcp-vertex/core/lib/workspace/create-workspace-path-provider';
import { createWorkspaceFileReader } from '@mcp-vertex/core/lib/bootstrap/workspace-file-reader';
import { buildInitConfigToolRegistration } from '@mcp-vertex/core/lib/bootstrap/init-config-tool';

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

	it('refuses to overwrite an existing config without overwrite:true', async () => {
		writeFileSync(
			join(root, 'mcp-vertex.config.json'),
			'{"plugins":{}}',
			'utf8',
		);
		const result = parse(await init({ write: true }));
		expect(result.ok).toBe(false);
		expect(result.error.reason).toContain('mcp-vertex.config.json');
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
});
