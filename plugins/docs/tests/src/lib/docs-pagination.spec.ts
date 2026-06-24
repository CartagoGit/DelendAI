/**
 * docs-pagination.spec.ts (M11 / H7)
 *
 * docs_list paginates over the catalogued docs with limit/offset, mirroring
 * memory_list, so an agent can page a large doc tree instead of getting a
 * blind `truncated: true`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDocsToolRegistrations } from '@mcp-vertex/docs/lib/tools';
import type { IToolTextResult } from '@mcp-vertex/core/public';

type Handler = (args: Record<string, unknown>) => Promise<IToolTextResult>;

const write = (root: string, rel: string, body: string): void => {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, body, 'utf8');
};

const docsListHandler = async (workspaceRootAbs: string): Promise<Handler> => {
	let handler: Handler | undefined;
	const reg = buildDocsToolRegistrations({
		namespacePrefix: 'docs',
		workspaceRootAbs,
	}).find((r) => r.id === 'docs_list');
	await reg?.register({
		registerTool: (_name: string, _schema: unknown, h: Handler) => {
			handler = h;
		},
	} as never);
	if (!handler) throw new Error('docs_list handler not registered');
	return handler;
};

const body = (res: IToolTextResult): Record<string, unknown> =>
	JSON.parse((res.content[0] as { text: string }).text);

describe('docs_list pagination (M11/H7)', async () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'docs-pg-'));
		for (let i = 0; i < 5; i += 1) {
			write(root, `docs/d${i}.md`, `# Doc ${i}\n`);
		}
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('returns the first page with total + nextOffset', async () => {
		const handler = await docsListHandler(root);
		const out = body(await handler({ limit: 2, offset: 0 }));
		expect(out.count).toBe(2);
		expect(out.total).toBe(5);
		expect(out.offset).toBe(0);
		expect(out.nextOffset).toBe(2);
		expect((out.docs as unknown[]).length).toBe(2);
	});

	it('omits nextOffset on the last page', async () => {
		const handler = await docsListHandler(root);
		const out = body(await handler({ limit: 2, offset: 4 }));
		expect(out.count).toBe(1);
		expect(out.total).toBe(5);
		expect(out.nextOffset).toBeUndefined();
	});

	it('clamps an absurd limit and a negative offset', async () => {
		const handler = await docsListHandler(root);
		const out = body(await handler({ limit: 9999, offset: -3 }));
		expect(out.offset).toBe(0);
		expect(out.count).toBe(5); // all, clamped to <=200
	});
});
