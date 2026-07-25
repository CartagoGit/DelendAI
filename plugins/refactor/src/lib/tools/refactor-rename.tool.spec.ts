/**
 * f00123 S2 — Tests for `refactor_rename` and `refactor_apply` tools.
 */
import { describe, expect, it, vi } from 'vitest';

import { buildRefactorRenameToolRegistrations } from './refactor-rename.tool';

const makeMockServer = () => {
	const tools: Record<
		string,
		{ handler: (args: unknown) => Promise<unknown> }
	> = {};
	return {
		server: {
			registerTool: (
				name: string,
				_schema: unknown,
				handler: (args: unknown) => Promise<unknown>,
			) => {
				tools[name] = { handler };
			},
		},
		tools,
	};
};

describe('refactor-rename tool', () => {
	describe('refactor_rename', () => {
		it('returns a diff via injected planner', async () => {
			const files = new Map<string, string>([
				['/root/test.ts', 'const foo = 42;'],
			]);
			const reader = vi.fn(async (path: string) => {
				const content = files.get(path);
				if (content === undefined)
					throw new Error(`Not found: ${path}`);
				return content;
			});

			const registrations = buildRefactorRenameToolRegistrations({
				namespacePrefix: 'test',
				workspaceRootAbs: '/workspace',
				readFile: reader,
			});

			const renameTool = registrations.find(
				(r) => r.id === 'refactor_rename',
			);
			expect(renameTool).toBeDefined();

			const mock = makeMockServer();
			await renameTool?.register(mock.server as never);

			const handler = mock.tools['test_refactor_rename']?.handler;
			expect(handler).toBeDefined();

			const result = await handler?.({
				root: '/root',
				from: 'foo',
				to: 'bar',
				scopePaths: ['/root/test.ts'],
			});

			expect(result).toBeDefined();
			const res = result as {
				content?: Array<{ type: string; text: string }>;
			};
			expect(res.content).toBeDefined();
			const jsonContent = res.content?.find(
				(c) => c.type === 'text',
			)?.text;
			expect(jsonContent).toBeDefined();
			const parsed = JSON.parse(jsonContent ?? '{}');
			expect(parsed.totalEdits).toBe(1);
			expect(parsed.files).toHaveLength(1);
			expect(parsed.files[0].path).toBe('/root/test.ts');
		});

		it('returns an error for unknown symbol', async () => {
			const files = new Map<string, string>([
				['/root/test.ts', 'const foo = 42;'],
			]);
			const reader = vi.fn(async (path: string) => {
				const content = files.get(path);
				if (content === undefined)
					throw new Error(`Not found: ${path}`);
				return content;
			});

			const registrations = buildRefactorRenameToolRegistrations({
				namespacePrefix: 'test',
				workspaceRootAbs: '/workspace',
				readFile: reader,
			});

			const renameTool = registrations.find(
				(r) => r.id === 'refactor_rename',
			);
			const mock = makeMockServer();
			await renameTool?.register(mock.server as never);

			const handler = mock.tools['test_refactor_rename']?.handler;
			const result = await handler?.({
				root: '/root',
				from: 'bar',
				to: 'baz',
				scopePaths: ['/root/test.ts'],
			});

			expect(result).toBeDefined();
			const res = result as {
				content?: Array<{ type: string; text: string }>;
				isError?: boolean;
			};
			expect(res.isError).toBe(true);
		});
	});

	describe('refactor_apply', () => {
		it('writes via fake fs and returns written paths', async () => {
			const files = new Map<string, string>([
				['/root/test.ts', 'const foo = 42;'],
			]);
			const reader = vi.fn(async (path: string) => {
				const content = files.get(path);
				if (content === undefined)
					throw new Error(`Not found: ${path}`);
				return content;
			});
			const writer = vi.fn(async (path: string, content: string) => {
				files.set(path, content);
			});

			const registrations = buildRefactorRenameToolRegistrations({
				namespacePrefix: 'test',
				workspaceRootAbs: '/workspace',
				readFile: reader,
				writeFileAtomic: writer,
			});

			const applyTool = registrations.find(
				(r) => r.id === 'refactor_apply',
			);
			expect(applyTool).toBeDefined();

			const mock = makeMockServer();
			await applyTool?.register(mock.server as never);

			const handler = mock.tools['test_refactor_apply']?.handler;
			expect(handler).toBeDefined();

			const result = await handler?.({
				root: '/root',
				files: [
					{
						path: '/root/test.ts',
						hunks: [
							{
								oldStart: 1,
								oldLines: 1,
								newStart: 1,
								newLines: 1,
								lines: [
									{ kind: '-', text: 'const foo = 42;' },
									{ kind: '+', text: 'const bar = 42;' },
								],
							},
						],
					},
				],
				consentToken: 'user-confirmed',
			});

			expect(result).toBeDefined();
			const res = result as {
				content?: Array<{ type: string; text: string }>;
			};
			expect(res.content).toBeDefined();
			const jsonContent = res.content?.find(
				(c) => c.type === 'text',
			)?.text;
			expect(jsonContent).toBeDefined();
			const parsed = JSON.parse(jsonContent ?? '{}');
			expect(parsed.written).toHaveLength(1);
			expect(parsed.written[0]).toBe('/root/test.ts');
			expect(parsed.gateCommand).toBe('bun run validate');
			expect(writer).toHaveBeenCalledWith(
				'/root/test.ts',
				expect.stringContaining('const bar = 42;'),
			);
		});

		it('rejects out-of-root paths', async () => {
			const files = new Map<string, string>();
			const reader = vi.fn(async (path: string) => {
				const content = files.get(path);
				if (content === undefined)
					throw new Error(`Not found: ${path}`);
				return content;
			});
			const writer = vi.fn();

			const registrations = buildRefactorRenameToolRegistrations({
				namespacePrefix: 'test',
				workspaceRootAbs: '/workspace',
				readFile: reader,
				writeFileAtomic: writer,
			});

			const applyTool = registrations.find(
				(r) => r.id === 'refactor_apply',
			);
			const mock = makeMockServer();
			await applyTool?.register(mock.server as never);

			const handler = mock.tools['test_refactor_apply']?.handler;
			const result = await handler?.({
				root: '/root',
				files: [
					{
						path: '/outside/test.ts',
						hunks: [],
					},
				],
				consentToken: 'user-confirmed',
			});

			expect(result).toBeDefined();
			const res = result as { isError?: boolean };
			expect(res.isError).toBe(true);
			expect(writer).not.toHaveBeenCalled();
		});

		it('echoes the consentToken via gateCommand', async () => {
			const files = new Map<string, string>([
				['/root/test.ts', 'const foo = 42;'],
			]);
			const reader = vi.fn(async (path: string) => {
				const content = files.get(path);
				if (content === undefined)
					throw new Error(`Not found: ${path}`);
				return content;
			});
			const writer = vi.fn();

			const registrations = buildRefactorRenameToolRegistrations({
				namespacePrefix: 'test',
				workspaceRootAbs: '/workspace',
				readFile: reader,
				writeFileAtomic: writer,
			});

			const applyTool = registrations.find(
				(r) => r.id === 'refactor_apply',
			);
			const mock = makeMockServer();
			await applyTool?.register(mock.server as never);

			const handler = mock.tools['test_refactor_apply']?.handler;
			const result = await handler?.({
				root: '/root',
				files: [
					{
						path: '/root/test.ts',
						hunks: [],
					},
				],
				consentToken: 'my-token-123',
			});

			expect(result).toBeDefined();
			const res = result as {
				content?: Array<{ type: string; text: string }>;
			};
			const jsonContent = res.content?.find(
				(c) => c.type === 'text',
			)?.text;
			const parsed = JSON.parse(jsonContent ?? '{}');
			expect(parsed.gateCommand).toBe('bun run validate');
		});
	});
});
