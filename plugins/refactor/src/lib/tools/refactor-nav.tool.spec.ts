import { describe, expect, it } from 'vitest';

import { buildRefactorNavToolRegistrations } from './refactor-nav.tool';

const fakeSource = `import { x } from './a';
export const PI = 3.14;
export function greet() { return x(PI); }
const used = greet();
`;

class FakeServer {
	tools: Record<
		string,
		{ handler: (a: unknown) => Promise<unknown>; meta: unknown }
	> = {};
	registerTool(
		name: string,
		meta: unknown,
		handler: (a: unknown) => Promise<unknown>,
	) {
		this.tools[name] = { handler, meta };
	}
}

const collectHandlers = (root = '/ws') => {
	const regs = buildRefactorNavToolRegistrations({
		namespacePrefix: 'refactor',
		workspaceRootAbs: root,
		readFile: async () => fakeSource,
	});
	const server = new FakeServer();
	for (const r of regs) void r.register(server as never);
	return server.tools;
};

const parseToolJson = (r: unknown) => {
	const text =
		(r as { content: Array<{ text: string }> }).content[0]?.text ?? '{}';
	return JSON.parse(text) as Record<string, unknown>;
};

describe('refactor_nav tool (f00123 S1)', () => {
	it('registers all three tools under the namespace prefix', () => {
		const t = collectHandlers();
		expect(Object.keys(t).sort()).toEqual([
			'refactor_refactor_definition',
			'refactor_refactor_references',
			'refactor_refactor_symbols',
		]);
	});

	it('refactor_references returns the right hit count', async () => {
		const t = collectHandlers();
		const handler = t.refactor_refactor_references?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseToolJson(
			await handler({ path: 'demo.ts', name: 'greet' }),
		);
		const hits = out.hits as Array<{
			name: string;
			isDefinition: boolean;
		}>;
		expect(hits.length).toBeGreaterThanOrEqual(2);
		expect(hits.some((h) => h.isDefinition)).toBe(true);
	});

	it('refactor_definition returns the kind for known symbols', async () => {
		const t = collectHandlers();
		const handler = t.refactor_refactor_definition?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseToolJson(
			await handler({ path: 'demo.ts', name: 'PI' }),
		);
		const hit = out.hit as { kind: string; name: string } | null;
		expect(hit).not.toBeNull();
		expect(hit?.kind).toBe('variable');
		expect(hit?.name).toBe('PI');
	});

	it('refactor_symbols returns only exported top-level decls', async () => {
		const t = collectHandlers();
		const handler = t.refactor_refactor_symbols?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseToolJson(await handler({ path: 'demo.ts' }));
		const hits = out.hits as Array<{ name: string }>;
		const names = hits.map((h) => h.name);
		expect(names).toEqual(expect.arrayContaining(['PI', 'greet']));
		expect(names).not.toContain('x');
	});

	// x00184 (F17): `path` used to pass an absolute path straight through
	// with zero containment check — a caller could read `/etc/shadow` (or
	// any host-readable file) via any of the three nav tools.
	describe('containment (x00184)', () => {
		it('rejects an absolute path', async () => {
			const t = collectHandlers();
			const handler = t.refactor_refactor_symbols?.handler as (
				a: unknown,
			) => Promise<unknown>;
			const out = (await handler({ path: '/etc/shadow' })) as {
				content: Array<{ text: string }>;
			};
			const body = JSON.parse(out.content[0]?.text ?? '{}') as {
				error?: { reason: string };
			};
			expect(body.error).toBeDefined();
		});

		it('rejects a path that traverses out via ../..', async () => {
			const t = collectHandlers();
			const handler = t.refactor_refactor_references?.handler as (
				a: unknown,
			) => Promise<unknown>;
			const out = (await handler({
				path: '../../../../etc/passwd',
				name: 'root',
			})) as { content: Array<{ text: string }> };
			const body = JSON.parse(out.content[0]?.text ?? '{}') as {
				error?: { reason: string };
			};
			expect(body.error).toBeDefined();
		});

		it('accepts a workspace-relative path', async () => {
			const t = collectHandlers();
			const handler = t.refactor_refactor_definition?.handler as (
				a: unknown,
			) => Promise<unknown>;
			const out = (await handler({
				path: 'nested/demo.ts',
				name: 'PI',
			})) as { content: Array<{ text: string }> };
			const body = JSON.parse(out.content[0]?.text ?? '{}') as {
				error?: unknown;
				hit?: { name: string };
			};
			expect(body.error).toBeUndefined();
			expect(body.hit?.name).toBe('PI');
		});
	});
});
