/**
 * f00046 S1 — unit tests for the git group. Verifies each command:
 *  1. has the canonical `name` (matches the CLI surface and the registry spec).
 *  2. delegates 1:1 to the corresponding `git_*` MCP tool.
 *  3. forwards CLI flags as the exact `inputSchema` shape the tool expects.
 *  4. returns a structured `ICliCommandResult` with `code: EXIT_CODE.OK` on success.
 *
 * The `ctx.request` is a stub that records the calls — no real MCP server is
 * booted. That keeps these specs deterministic and fast (no stdio spawn).
 */
import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';
import { gitCommands } from './git';

const buildStubContext = (): {
	readonly ctx: ICliCommandContext;
	readonly calls: { readonly tool: string; readonly args: object }[];
} => {
	const calls: { tool: string; args: object }[] = [];
	const ctx: ICliCommandContext = {
		cwd: '/workspace',
		globals: {
			workspace: '/workspace',
			json: false,
			format: 'text',
			lang: 'en',
			noColor: false,
			plugins: [],
		},
		request: async <TOut>(
			tool: string,
			args: object = {},
		): Promise<TOut> => {
			calls.push({ tool, args });
			return { ok: true } as unknown as TOut;
		},
		listTools: async () => [],
		close: async () => {},
	};
	return { ctx, calls };
};

const findCommand = (name: string): ICliCommand | undefined =>
	gitCommands.find((command) => command.name === name);

describe('git group (f00046 S1)', async () => {
	it('exposes the 7 canonical commands', async () => {
		const expected = [
			'git status',
			'git changed',
			'git diff',
			'git log',
			'git blame',
			'git show',
			'git worktree',
		];
		const names = gitCommands.map((command) => command.name);
		expect(names).toEqual(expected);
	});

	it('keeps every command documented with a non-empty summary', async () => {
		for (const command of gitCommands) {
			expect(command.summary.trim().length).toBeGreaterThan(0);
		}
	});

	it('does not register duplicate command names', async () => {
		const names = gitCommands.map((command) => command.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it('git status delegates to mcp-vertex_git_status with no args', async () => {
		const { ctx, calls } = buildStubContext();
		const result = await findCommand('git status')!.run([], ctx);
		expect(calls).toEqual([{ tool: 'mcp-vertex_git_status', args: {} }]);
		expect(result.code).toBe(EXIT_CODE.OK);
	});

	it('git changed delegates to mcp-vertex_git_changed with no args', async () => {
		const { ctx, calls } = buildStubContext();
		const result = await findCommand('git changed')!.run([], ctx);
		expect(calls).toEqual([{ tool: 'mcp-vertex_git_changed', args: {} }]);
		expect(result.code).toBe(EXIT_CODE.OK);
	});

	it('git diff forwards --staged and --path', async () => {
		const { ctx, calls } = buildStubContext();
		const result = await findCommand('git diff')!.run(
			['--staged', '--path=src/server.ts'],
			ctx,
		);
		expect(calls).toEqual([
			{
				tool: 'mcp-vertex_git_diff',
				args: { staged: true, path: 'src/server.ts' },
			},
		]);
		expect(result.code).toBe(EXIT_CODE.OK);
	});

	it('git diff without flags sends an empty args object', async () => {
		const { ctx, calls } = buildStubContext();
		await findCommand('git diff')!.run([], ctx);
		expect(calls).toEqual([{ tool: 'mcp-vertex_git_diff', args: {} }]);
	});

	it('git log forwards --limit as a number', async () => {
		const { ctx, calls } = buildStubContext();
		await findCommand('git log')!.run(['--limit=5'], ctx);
		expect(calls).toEqual([
			{ tool: 'mcp-vertex_git_log', args: { limit: 5 } },
		]);
	});

	it('git blame requires a positional path', async () => {
		const { ctx, calls } = buildStubContext();
		const result: ICliCommandResult = await findCommand('git blame')!.run(
			[],
			ctx,
		);
		expect(result.code).toBe(EXIT_CODE.USAGE);
		expect(calls).toEqual([]);
	});

	it('git blame forwards path and start/end line numbers', async () => {
		const { ctx, calls } = buildStubContext();
		await findCommand('git blame')!.run(
			['src/server.ts', '--start-line=10', '--end-line=20'],
			ctx,
		);
		expect(calls).toEqual([
			{
				tool: 'mcp-vertex_git_blame',
				args: { path: 'src/server.ts', startLine: 10, endLine: 20 },
			},
		]);
	});

	it('git show forwards an optional ref and --path', async () => {
		const { ctx, calls } = buildStubContext();
		await findCommand('git show')!.run(
			['HEAD~1', '--path=src/server.ts'],
			ctx,
		);
		expect(calls).toEqual([
			{
				tool: 'mcp-vertex_git_show',
				args: { ref: 'HEAD~1', path: 'src/server.ts' },
			},
		]);
	});

	it('git worktree delegates to mcp-vertex_git_worktree with no args', async () => {
		const { ctx, calls } = buildStubContext();
		const result = await findCommand('git worktree')!.run([], ctx);
		expect(calls).toEqual([{ tool: 'mcp-vertex_git_worktree', args: {} }]);
		expect(result.code).toBe(EXIT_CODE.OK);
	});
});
