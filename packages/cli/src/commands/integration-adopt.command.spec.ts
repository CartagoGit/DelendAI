import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';

import { runIntegrationAdopt } from './integration-adopt.command';

const withDir = async (
	config: string,
	run: (ctx: ICliCommandContext, dir: string) => Promise<void>,
): Promise<void> => {
	const dir = mkdtempSync(join(tmpdir(), 'integration-adopt-'));
	try {
		writeFileSync(join(dir, 'delendai.config.json'), config);
		await run(fakePartial<ICliCommandContext>({ cwd: dir }), dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};

describe('integration adopt', () => {
	it('[<200ms] asks for the jobs the signal waits on when none are named or configured', async () => {
		await withDir('{}', async (ctx) => {
			const result = await runIntegrationAdopt([], ctx);
			expect(result.code).toBe(EXIT_CODE.USAGE);
			expect(result.error).toContain('--needs');
		});
	});

	it('[<200ms] writes the adoption files and prints the signal job for the named jobs', async () => {
		await withDir('{}', async (ctx, dir) => {
			const result = await runIntegrationAdopt(
				['--needs=build,test'],
				ctx,
			);
			expect(result.code).toBe(EXIT_CODE.OK);
			const written = (result.data as { written: string[] }).written;
			expect(written.length).toBeGreaterThan(0);
			expect(result.text).toContain('Append this job');
			for (const path of written) {
				expect(existsSync(join(dir, path))).toBe(true);
			}
		});
	});
});
