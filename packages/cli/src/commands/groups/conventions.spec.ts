/**
 * f00046 S9 — conventions check/plan/apply tests. `check` delegates to
 * conventions_check; non-TypeScript profiles are rejected; `apply`
 * without --dry-run fails when violations remain (no blind rename).
 */
import { describe, expect, it } from 'vitest';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
} from '../../contracts/interfaces/cli-command.interface';
import { conventionsCommands } from './conventions';

const buildStubContext = (response: unknown = { ok: true }) => {
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
			return response as TOut;
		},
		listTools: async () => [],
		close: async () => {},
	};
	return { ctx, calls };
};

const find = (name: string): ICliCommand => {
	const command = conventionsCommands.find((c) => c.name === name);
	if (command === undefined) throw new Error(`missing command: ${name}`);
	return command;
};

describe('conventions group (f00046 S9)', async () => {
	it('check delegates to conventions_check with roots', async () => {
		const { ctx, calls } = buildStubContext({ unmatchedCount: 0 });
		await find('conventions check').run(['--roots=packages,plugins'], ctx);
		expect(calls[0]).toEqual({
			tool: 'conventions_check',
			args: { roots: ['packages', 'plugins'] },
		});
	});

	it('rejects a non-typescript profile', async () => {
		const { ctx, calls } = buildStubContext();
		const res = await find('conventions check').run(
			['--profile=python'],
			ctx,
		);
		expect(res.code).toBe(EXIT_CODE.VALIDATION);
		expect(calls).toHaveLength(0);
	});

	it('plan frames the unmatched files as a migration backlog', async () => {
		const { ctx } = buildStubContext({
			unmatchedCount: 2,
			unmatched: ['a.ts', 'b.ts'],
		});
		const res = await find('conventions plan').run([], ctx);
		expect(res.code).toBe(EXIT_CODE.OK);
		expect((res.data as { toMigrate: string[] }).toMigrate).toEqual([
			'a.ts',
			'b.ts',
		]);
	});

	it('apply fails (VALIDATION) when violations remain and not --dry-run', async () => {
		const { ctx } = buildStubContext({ unmatchedCount: 3, unmatched: [] });
		const res = await find('conventions apply').run([], ctx);
		expect(res.code).toBe(EXIT_CODE.VALIDATION);
	});

	it('apply --dry-run reports the backlog without failing', async () => {
		const { ctx } = buildStubContext({ unmatchedCount: 3, unmatched: [] });
		const res = await find('conventions apply').run(['--dry-run'], ctx);
		expect(res.code).toBe(EXIT_CODE.OK);
		expect((res.data as { outstanding: number }).outstanding).toBe(3);
	});
});
