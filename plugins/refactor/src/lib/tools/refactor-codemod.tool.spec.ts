import { describe, expect, it } from 'vitest';

import { buildRefactorCodemodToolRegistrations } from './refactor-codemod.tool';

class FakeServer {
	tools: Record<string, { handler: (a: unknown) => Promise<unknown> }> = {};
	registerTool(
		name: string,
		_meta: unknown,
		handler: (a: unknown) => Promise<unknown>,
	) {
		this.tools[name] = { handler };
	}
}

const parse = (r: unknown): Record<string, unknown> => {
	const text =
		(r as { content: Array<{ text: string }> }).content[0]?.text ?? '{}';
	return JSON.parse(text) as Record<string, unknown>;
};

const buildTools = (
	files: Record<string, string>,
	written: Array<{ path: string; content: string }> = [],
) => {
	const regs = buildRefactorCodemodToolRegistrations({
		namespacePrefix: 'refactor',
		workspaceRootAbs: '/ws',
		listFiles: async (cwdAbs) =>
			Object.keys(files)
				.filter((path) => path.startsWith(cwdAbs))
				.sort(),
		readFile: async (absPath) => {
			const content = files[absPath];
			if (content === undefined) throw new Error(`missing ${absPath}`);
			return content;
		},
		writeFileAtomic: async (absPath, content) => {
			written.push({ path: absPath, content });
		},
	});
	const server = new FakeServer();
	for (const reg of regs) void reg.register(server as never);
	return server.tools;
};

describe('refactor_codemod (f00123 S3)', () => {
	it('returns a unified diff in dry-run mode without writing files', async () => {
		const tools = buildTools({
			'/ws/src/a.ts': 'export const loose = left == right;\n',
		});
		const handler = tools['refactor_refactor_codemod']?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parse(
			await handler({ recipeId: 'ts/strict-equal', cwd: 'src' }),
		);
		expect(out['recipeId']).toBe('ts/strict-equal');
		expect(out['totalEdits']).toBe(1);
		const files = out['files'] as Array<{ path: string; diff: string }>;
		expect(files).toHaveLength(1);
		expect(files[0]?.path).toBe('src/a.ts');
		expect(files[0]?.diff).toContain('left === right');
	});

	it('writes changes atomically when dryRun is false', async () => {
		const written: Array<{ path: string; content: string }> = [];
		const tools = buildTools(
			{
				'/ws/src/fail.ts': "throw 'boom';\n",
			},
			written,
		);
		const handler = tools['refactor_refactor_codemod']?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parse(
			await handler({
				recipeId: 'ts/no-throw-literal',
				cwd: 'src',
				dryRun: false,
			}),
		);
		expect(out['totalEdits']).toBe(1);
		expect(written).toHaveLength(1);
		expect(written[0]?.path).toBe('/ws/src/fail.ts');
		expect(written[0]?.content).toContain("throw new Error('boom');");
	});

	it('rejects cwd values outside the workspace root', async () => {
		const tools = buildTools({
			'/ws/src/a.ts': 'export const loose = left == right;\n',
		});
		const handler = tools['refactor_refactor_codemod']?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parse(
			await handler({ recipeId: 'ts/strict-equal', cwd: '../escape' }),
		);
		expect(out['ok']).toBe(false);
	});

	it('returns no edits for ts/console-to-logger when logger is not imported', async () => {
		const tools = buildTools({
			'/ws/src/log.ts': 'console.log(value);\nconsole.error(value);\n',
		});
		const handler = tools['refactor_refactor_codemod']?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parse(
			await handler({ recipeId: 'ts/console-to-logger', cwd: 'src' }),
		);
		expect(out['totalEdits']).toBe(0);
		expect(out['files']).toEqual([]);
	});
});
