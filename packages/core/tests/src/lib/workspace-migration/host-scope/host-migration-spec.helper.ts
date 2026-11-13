/**
 * host-migration-spec.helper.ts — the four fixtures every host migrator is
 * proved against: the old name, the old launch shape, a mixed file with a
 * foreign entry, and a clean file. Each proves idempotence, the backup, the
 * untouched foreign entry and the not-covered report.
 */
import { describe, expect, it } from 'vitest';

import type { ILegacyResidueIO } from '@delendai/core/lib/contracts/interfaces/legacy-residue.interface';
import { resolveUserConfigPaths } from '@delendai/core/lib/workspace-migration/host-scope/user-config-paths.helper';
import { migrateUserHostConfigs } from '@delendai/core/lib/workspace-migration/host-scope/user-host-config.migrator';

export interface IHostFixtures {
	readonly hostId: string;
	readonly file: string;
	readonly oldName: string;
	readonly oldLaunchShape: string;
	/** An entry of the old name beside one that is not delendai's. */
	readonly mixed: string;
	/** What the foreign entry of `mixed` is called. */
	readonly foreignName: string;
	/** A string that must still be in the file, byte for byte, after the migration. */
	readonly foreignText: string;
	readonly clean: string;
}

const env = { platform: 'linux', home: '/h' } as const;

const run = async (files: Map<string, string>) => {
	const io: ILegacyResidueIO = {
		readText: async (path) => files.get(path),
		writeText: async (path, text) => {
			files.set(path, text);
		},
	};
	return migrateUserHostConfigs({
		resolved: resolveUserConfigPaths(env),
		io,
		backupDir: '/h/state/backups',
		now: () => new Date('2026-11-12T10:00:00.000Z'),
	});
};

export const describeHostMigration = (fixtures: IHostFixtures): void => {
	describe(`the ${fixtures.hostId} user-level migration`, () => {
		for (const [label, text] of [
			['the old name', fixtures.oldName],
			['the old launch shape', fixtures.oldLaunchShape],
		] as const) {
			it(`[<20ms] migrates ${label}, backs the file up first and is idempotent`, async () => {
				const files = new Map([[fixtures.file, text]]);
				const first = await run(files);
				expect(first.changes).toHaveLength(1);
				expect(files.get(first.changes[0]?.backup ?? '')).toBe(text);
				expect(files.get(fixtures.file)).not.toBe(text);
				expect(files.get(fixtures.file)).not.toContain('mcp-vertex');
				expect((await run(files)).changes).toEqual([]);
			});
		}

		it('[<20ms] leaves the foreign entry of a mixed file untouched and asks about it', async () => {
			const files = new Map([[fixtures.file, fixtures.mixed]]);
			const report = await run(files);
			expect(files.get(fixtures.file)).toContain(fixtures.foreignText);
			expect(report.questions.map((question) => question.entry)).toEqual([
				fixtures.foreignName,
			]);
		});

		it('[<20ms] leaves a clean file as it is, with no backup', async () => {
			const files = new Map([[fixtures.file, fixtures.clean]]);
			const report = await run(files);
			expect(report.changes).toEqual([]);
			expect(files.get(fixtures.file)).toBe(fixtures.clean);
			expect(files.size).toBe(1);
		});

		it('[<20ms] reports the hosts that declare no user-level file as not covered', async () => {
			const report = await run(new Map());
			expect(report.notCovered).toContain('windsurf');
			expect(report.notCovered).not.toContain(fixtures.hostId);
		});
	});
};
