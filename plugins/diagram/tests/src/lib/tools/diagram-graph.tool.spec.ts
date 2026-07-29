import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildDiagramGraphToolRegistrations } from '../../../../src/lib/tools/diagram-graph.tool';

/** Invoke a registration's handler against a minimal fake MCP server. */
const invoke = async (
	reg: ReturnType<typeof buildDiagramGraphToolRegistrations>[number],
	args: unknown,
): Promise<{ content: Array<{ text: string }> }> => {
	let handler:
		| ((a: unknown) => Promise<{ content: Array<{ text: string }> }>)
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
	if (!handler) throw new Error(`${reg.id} did not register a handler`);
	return handler(args);
};

const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

// x00168 (S2): `packageRoot` used to reach `readdir`/`readFile` with zero
// containment check — a caller could point it at any directory the host
// process can read. Now workspace-relative + resolveWorkspaceContained.
describe('diagram_modules — packageRoot containment (x00168)', () => {
	it('rejects an out-of-workspace packageRoot instead of listing it', async () => {
		const workspaceRootAbs = await mkdtemp(
			path.join(tmpdir(), 'diagram-ws-'),
		);
		const outside = await mkdtemp(path.join(tmpdir(), 'diagram-outside-'));
		await writeFile(
			path.join(outside, 'secret.ts'),
			'export const secretModule = 1;',
			'utf8',
		);
		try {
			const registrations = buildDiagramGraphToolRegistrations({
				namespacePrefix: 'mcp-vertex',
				workspaceRootAbs,
			});
			const modules = registrations.find(
				(r) => r.id === 'diagram_modules',
			);
			if (!modules) throw new Error('diagram_modules not registered');
			const result = await invoke(modules, { packageRoot: outside });
			const data = parse(result);
			expect(data.error).toBeDefined();
			expect(JSON.stringify(data)).not.toContain('secretModule');
		} finally {
			await rm(workspaceRootAbs, { recursive: true, force: true });
			await rm(outside, { recursive: true, force: true });
		}
	});

	it('rejects a packageRoot that traverses out via ../..', async () => {
		const workspaceRootAbs = await mkdtemp(
			path.join(tmpdir(), 'diagram-ws-'),
		);
		try {
			const registrations = buildDiagramGraphToolRegistrations({
				namespacePrefix: 'mcp-vertex',
				workspaceRootAbs,
			});
			const modules = registrations.find(
				(r) => r.id === 'diagram_modules',
			);
			if (!modules) throw new Error('diagram_modules not registered');
			const result = await invoke(modules, {
				packageRoot: '../../../../etc',
			});
			const data = parse(result);
			expect(data.error).toBeDefined();
		} finally {
			await rm(workspaceRootAbs, { recursive: true, force: true });
		}
	});

	it('accepts a workspace-relative packageRoot', async () => {
		const workspaceRootAbs = await mkdtemp(
			path.join(tmpdir(), 'diagram-ws-'),
		);
		try {
			const pkgDir = path.join(
				workspaceRootAbs,
				'packages',
				'demo',
				'src',
			);
			await mkdir(pkgDir, { recursive: true });
			await writeFile(
				path.join(pkgDir, 'index.ts'),
				'export const demo = 1;',
				'utf8',
			);
			const registrations = buildDiagramGraphToolRegistrations({
				namespacePrefix: 'mcp-vertex',
				workspaceRootAbs,
			});
			const modules = registrations.find(
				(r) => r.id === 'diagram_modules',
			);
			if (!modules) throw new Error('diagram_modules not registered');
			const result = await invoke(modules, {
				packageRoot: 'packages/demo',
			});
			const data = parse(result);
			expect(data.error).toBeUndefined();
			expect(data.nodes).toContain('src/index');
		} finally {
			await rm(workspaceRootAbs, { recursive: true, force: true });
		}
	});
});
