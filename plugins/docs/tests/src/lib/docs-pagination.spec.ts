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

/**
 * f00057 S11: `docs_search` is deprecated. The handler must return the
 * typed deprecation envelope regardless of the input so callers learn
 * the replacement at runtime instead of receiving stale ranked hits.
 */
describe('docs_search deprecation (f00057 S11)', async () => {
	let root = '';
	let registration: ReturnType<typeof buildDocsToolRegistrations>[number];
	let handler: Handler;

	const docsSearchHandler = async (
		workspaceRootAbs: string,
	): Promise<Handler> => {
		const reg = buildDocsToolRegistrations({
			namespacePrefix: 'docs',
			workspaceRootAbs,
		}).find((r) => r.id === 'docs_search');
		if (!reg) throw new Error('docs_search registration not found');
		let h: Handler | undefined;
		await reg.register({
			registerTool: (_name: string, _schema: unknown, hh: Handler) => {
				h = hh;
			},
		} as never);
		if (!h) throw new Error('docs_search handler not registered');
		return h;
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'docs-search-dep-'));
		write(root, 'docs/a.md', '# Alpha\n\nalpha content.\n');
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('marks the registration with a deprecation marker (replacement + since)', () => {
		registration = buildDocsToolRegistrations({
			namespacePrefix: 'docs',
			workspaceRootAbs: root,
		}).find((r) => r.id === 'docs_search')!;
		expect(registration.deprecated).toBeDefined();
		expect(registration.deprecated?.replacement).toBe('search_search');
		expect(registration.deprecated?.replacementArgs).toEqual({
			roots: ['docs'],
		});
		expect(registration.deprecated?.since).toMatch(/^\d+\.\w+\.\w+/);
	});

	it('handler returns ok:false with reason=deprecated + replacement', async () => {
		handler = await docsSearchHandler(root);
		const result = await handler({ query: 'alpha' });
		expect(result.isError).toBe(true);
		const envelope = body(result);
		expect(envelope.ok).toBe(false);
		expect((envelope.error as { reason: string }).reason).toBe(
			'deprecated',
		);
		const err = envelope.error as {
			replacement: string;
			replacementArgs?: Record<string, unknown>;
			since: string;
		};
		expect(err.replacement).toBe('search_search');
		expect(err.replacementArgs).toEqual({ roots: ['docs'] });
		expect(err.since).toMatch(/^\d+\.\w+\.\w+/);
	});

	it('handler ignores input and always returns the envelope (idempotent)', async () => {
		handler = await docsSearchHandler(root);
		const a = await handler({ query: 'alpha' });
		const b = await handler({ query: '', limit: 0 });
		const c = await handler({ include: ['docs/**'] });
		const ea = body(a);
		const eb = body(b);
		const ec = body(c);
		expect(ea).toEqual(eb);
		expect(eb).toEqual(ec);
	});
});
