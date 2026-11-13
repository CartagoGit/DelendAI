/**
 * legacy-residue-scan.service.ts — the residue registry asked on demand, by
 * `doctor` and `init`: what is there (reading only) and what to apply now.
 *
 * Applying follows the boot run's rule: only entries the registry can prove
 * are delendai's own are edited, each file after its backup. Everything else
 * is reported, with what to do by hand.
 */
import { homedir } from 'node:os';
import { dirname } from 'node:path';

import { LEGACY_RESIDUE_BACKUPS_DIR } from '../../contracts/constants/legacy-residue.constant';
import type { ILegacyResidueBootOptions } from '../../contracts/interfaces/legacy-residue.interface';
import type { IUserHostConfigReport } from '../../contracts/interfaces/user-host-config.interface';
import { windowsAppDataUnderWsl } from '../../platform/user-directories.helper';
import { resolveUserConfigPaths } from '../host-scope/user-config-paths.helper';
import { migrateUserHostConfigs } from '../host-scope/user-host-config.migrator';
import {
	createUserFileIO,
	userStateDirectory,
} from './legacy-residue-boot.service';
import { renderLegacyResidueReport } from './legacy-residue-report.helper';

/** This machine, as the residue run needs to know it. */
export const thisMachineResidueOptions = (
	workspaceRoot: string,
): ILegacyResidueBootOptions => ({
	workspaceRoot,
	home: homedir(),
	platform:
		process.platform === 'win32' || process.platform === 'darwin'
			? process.platform
			: 'linux',
	...(process.env.APPDATA === undefined
		? {}
		: { appData: process.env.APPDATA }),
	windowsHomes: windowsAppDataUnderWsl().map((dir) => dirname(dirname(dir))),
	env: process.env,
	configText: undefined,
	io: createUserFileIO(),
	now: () => new Date(),
});

const run = (
	options: ILegacyResidueBootOptions,
	dryRun: boolean,
): Promise<IUserHostConfigReport> =>
	migrateUserHostConfigs({
		resolved: resolveUserConfigPaths(options),
		io: options.io,
		backupDir: `${userStateDirectory(options.home)}/${LEGACY_RESIDUE_BACKUPS_DIR}`,
		now: options.now,
		dryRun,
	});

/** What would change and what is only a question; nothing is written. */
export const scanLegacyResidue = (
	options: ILegacyResidueBootOptions,
): Promise<IUserHostConfigReport> => run(options, true);

/** Migrates what is provably delendai's own; the lines say what was done. */
export const applyLegacyResidue = async (
	options: ILegacyResidueBootOptions,
): Promise<{
	readonly report: IUserHostConfigReport;
	readonly lines: readonly string[];
}> => {
	const report = await run(options, false);
	return {
		report,
		lines: renderLegacyResidueReport(report, new Set()).lines,
	};
};
