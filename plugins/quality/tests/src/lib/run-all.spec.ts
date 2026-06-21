import { describe, expect, it } from 'vitest';

import type { ICommandRunner } from '@mcp-vertex/quality/lib/runner';
import {
	buildRunAllToolRegistration,
	runAllScopes,
} from '@mcp-vertex/quality/lib/run-all';
import type { IFileReader } from '@mcp-vertex/core/public';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => [],
});

describe('runAllScopes', () => {
	it('aggregates 3 passing scopes into one ok:true report', async () => {
		const run: ICommandRunner = async () => ({
			code: 0,
			output: 'ok',
			timedOut: false,
		});
		const report = await runAllScopes(
			{
				lint: [{ command: 'lint', expect: 'exit0' }],
				test: [{ command: 'test', expect: 'exit0' }],
				build: [{ command: 'build', expect: 'exit0' }],
			},
			'/ws',
			run,
		);
		expect(report.summary).toEqual({ ok: true, scopes: 3 });
		expect(report.results.every((r) => r.ok)).toBe(true);
		expect(report.results.every((r) => r.errors.length === 0)).toBe(true);
	});

	it('marks summary.ok false and surfaces errors when one scope fails', async () => {
		const run: ICommandRunner = async (command) =>
			command.includes('fail')
				? { code: 1, output: 'boom output', timedOut: false }
				: { code: 0, output: 'ok', timedOut: false };
		const report = await runAllScopes(
			{
				lint: [{ command: 'lint', expect: 'exit0' }],
				test: [{ command: 'fail-test', expect: 'exit0' }],
			},
			'/ws',
			run,
		);
		expect(report.summary.ok).toBe(false);
		const test = report.results.find((r) => r.scope === 'test');
		expect(test?.ok).toBe(false);
		expect(test?.errors[0]).toContain('fail-test');
		expect(test?.errors[0]).toContain('boom');
	});

	it('an empty scope map reports a vacuous ok:true with zero scopes', async () => {
		const run: ICommandRunner = async () => ({
			code: 0,
			output: '',
			timedOut: false,
		});
		const report = await runAllScopes({}, '/ws', run);
		expect(report.summary).toEqual({ ok: true, scopes: 0 });
		expect(report.results).toEqual([]);
	});

	it('terminates for a self-referential/cyclic-looking scope name without hanging', async () => {
		// IScopeMap has no inter-scope dependency edges — each scope is just a
		// list of shell commands — so a scope that mentions another scope's
		// name in its own command string cannot create a real cycle. This
		// guards that `runAllScopes` still iterates once per key and returns
		// (no graph walk, no risk of infinite recursion).
		const run: ICommandRunner = async () => ({
			code: 0,
			output: 'ok',
			timedOut: false,
		});
		const report = await runAllScopes(
			{
				a: [{ command: 'run-scope-b', expect: 'exit0' }],
				b: [{ command: 'run-scope-a', expect: 'exit0' }],
			},
			'/ws',
			run,
		);
		expect(report.summary).toEqual({ ok: true, scopes: 2 });
	});
});

describe('quality_run_all tool registration', () => {
	it('rejects an unknown/empty scope configuration', async () => {
		const registration = buildRunAllToolRegistration({
			namespacePrefix: 'quality',
			reader: reader({}),
			workspaceRoot: '/ws',
			run: async () => ({ code: 0, output: '', timedOut: false }),
		});
		expect(registration.id).toBe('quality_run_all');
		expect(registration.effects).toEqual(['spawn']);

		let handler: ((args: unknown) => Promise<unknown>) | undefined;
		const fakeServer = {
			registerTool: (
				_name: string,
				_def: unknown,
				fn: (args: unknown) => Promise<unknown>,
			) => {
				handler = fn;
			},
			// minimal stub surface; only registerTool is exercised here
		} as unknown as Parameters<typeof registration.register>[0];

		await registration.register(fakeServer);
		const result = (await handler?.({})) as {
			isError?: boolean;
			structuredContent?: { error?: { reason?: string } };
		};
		expect(result.isError).toBe(true);
	});

	it('aggregates configured option scopes end to end', async () => {
		const registration = buildRunAllToolRegistration({
			namespacePrefix: 'quality',
			reader: reader({}),
			workspaceRoot: '/ws',
			run: async () => ({ code: 0, output: 'done', timedOut: false }),
			optionScopes: { lint: ['eslint .'], test: ['vitest run'] },
		});

		let handler: ((args: unknown) => Promise<unknown>) | undefined;
		const fakeServer = {
			registerTool: (
				_name: string,
				_def: unknown,
				fn: (args: unknown) => Promise<unknown>,
			) => {
				handler = fn;
			},
		} as unknown as Parameters<typeof registration.register>[0];

		await registration.register(fakeServer);
		const result = (await handler?.({})) as {
			structuredContent?: {
				summary?: { ok: boolean; scopes: number };
			};
		};
		expect(result.structuredContent?.summary).toEqual({
			ok: true,
			scopes: 2,
		});
	});
});
