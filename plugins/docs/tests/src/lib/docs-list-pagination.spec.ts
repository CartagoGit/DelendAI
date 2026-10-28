/**
 * docs-list-pagination.spec.ts — `docs_list` pages through the whole
 * catalogue: `total` counts every doc, not the first catalogue page.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildDocsToolRegistrations } from '../../../src/lib/tools/tools';

const DOC_COUNT = 250;
const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0))
		await rm(root, { recursive: true, force: true });
});

const docsList = async (
	root: string,
): Promise<(args: object) => Promise<{ structuredContent?: unknown }>> => {
	const registerTool = vi.fn();
	const [registration] = buildDocsToolRegistrations({
		namespacePrefix: 'delendai',
		workspaceRootAbs: root,
	});
	await registration?.register({ registerTool } as Pick<
		McpServer,
		'registerTool'
	> as McpServer);
	return registerTool.mock.calls[0]?.[2] as (
		args: object,
	) => Promise<{ structuredContent?: unknown }>;
};

describe('docs_list', () => {
	it('counts every doc in total and pages past the first catalogue page', async () => {
		const root = await mkdtemp(join(tmpdir(), 'docs-list-'));
		roots.push(root);
		await mkdir(join(root, 'docs'), { recursive: true });
		await Promise.all(
			Array.from({ length: DOC_COUNT }, (_, index) =>
				writeFile(
					join(
						root,
						'docs',
						`page-${String(index).padStart(3, '0')}.md`,
					),
					`# Page ${index}\n`,
				),
			),
		);
		const list = await docsList(root);
		const last = (await list({ limit: 200, offset: 200 }))
			.structuredContent as {
			total: number;
			count: number;
			truncated: boolean;
			nextOffset?: number;
		};
		expect(last.total).toBe(DOC_COUNT);
		expect(last.count).toBe(DOC_COUNT - 200);
		expect(last.truncated).toBe(false);
		expect(last.nextOffset).toBeUndefined();
	});
});
