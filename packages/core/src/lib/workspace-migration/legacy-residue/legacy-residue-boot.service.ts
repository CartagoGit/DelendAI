/**
 * legacy-residue-boot.service.ts — the residue registry, run once per
 * machine at server boot over the user-level host configs.
 *
 * A clean machine prints nothing. The run is recorded in the user state
 * directory against the registry it was made with, so it does not repeat
 * until the registry changes. A project turns it off with the
 * `legacyResidue: false` configuration key, a person with the
 * `DELENDAI_LEGACY_RESIDUE=0` variable. It never throws: a file it cannot
 * read is reported and the boot goes on.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
	LEGACY_RESIDUE_BACKUPS_DIR,
	LEGACY_RESIDUE_CONFIG_KEY,
	LEGACY_RESIDUE_ENV,
	LEGACY_RESIDUE_STATE_FILE,
} from '../../contracts/constants/legacy-residue.constant';
import type {
	ILegacyResidueBootOptions,
	ILegacyResidueIO,
	ILegacyResidueState,
} from '../../contracts/interfaces/legacy-residue.interface';
import { parseJsonc } from '../../config/jsonc-document';
import { isRecord } from '../../shared/is-record';
import { resolveUserConfigPaths } from '../host-scope/user-config-paths.helper';
import { migrateUserHostConfigs } from '../host-scope/user-host-config.migrator';
import { legacyResidueRegistry } from './legacy-residue.registry';
import { renderLegacyResidueReport } from './legacy-residue-report.helper';

/** The user state directory, under the home directory. */
export const userStateDirectory = (home: string): string =>
	`${home}/.local/share/delendai`;

/** Reads and writes real files; a write creates the directories above it. */
export const createUserFileIO = (): ILegacyResidueIO => ({
	readText: async (path) =>
		readFile(path, 'utf8').then(
			(text) => text,
			() => undefined,
		),
	writeText: async (path, text) => {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, text, 'utf8');
	},
});

const registryFingerprint = (): string =>
	legacyResidueRegistry
		.map((entry) => `${entry.id}@${entry.since}`)
		.join(',');

const OFF_VALUES: ReadonlySet<string> = new Set(['0', 'off', 'false']);

const projectOptedOut = (configText: string | undefined): boolean => {
	if (configText === undefined) return false;
	const parsed = parseJsonc(configText).value;
	return isRecord(parsed) && parsed[LEGACY_RESIDUE_CONFIG_KEY] === false;
};

/** Whether the person or the project turned the residue run off. */
export const legacyResidueDisabled = (
	env: Readonly<Record<string, string | undefined>>,
	configText: string | undefined,
): boolean => {
	const off = env[LEGACY_RESIDUE_ENV];
	return (
		(off !== undefined && OFF_VALUES.has(off.toLowerCase())) ||
		projectOptedOut(configText)
	);
};

const readState = async (
	io: ILegacyResidueIO,
	path: string,
): Promise<ILegacyResidueState | undefined> => {
	const text = await io.readText(path);
	if (text === undefined) return undefined;
	try {
		const value: unknown = JSON.parse(text);
		if (
			isRecord(value) &&
			typeof value.registry === 'string' &&
			Array.isArray(value.asked)
		) {
			return {
				registry: value.registry,
				asked: value.asked.filter(
					(item): item is string => typeof item === 'string',
				),
			};
		}
	} catch {
		return undefined;
	}
	return undefined;
};

/** The lines to print at boot; empty when there is nothing to say. */
export const runLegacyResidueBoot = async (
	options: ILegacyResidueBootOptions,
): Promise<readonly string[]> => {
	if (legacyResidueDisabled(options.env, options.configText)) return [];
	try {
		const stateDir = userStateDirectory(options.home);
		const statePath = `${stateDir}/${LEGACY_RESIDUE_STATE_FILE}`;
		const fingerprint = registryFingerprint();
		const state = await readState(options.io, statePath);
		if (state?.registry === fingerprint) return [];
		const report = await migrateUserHostConfigs({
			resolved: resolveUserConfigPaths(options),
			io: options.io,
			backupDir: `${stateDir}/${LEGACY_RESIDUE_BACKUPS_DIR}`,
			now: options.now,
		});
		for (const entry of legacyResidueRegistry) {
			if (entry.scope !== 'machine') continue;
			const ctx = { root: options.home, io: options.io };
			if (await entry.detect(ctx)) await entry.migrate(ctx);
		}
		const rendered = renderLegacyResidueReport(
			report,
			new Set(state?.asked ?? []),
		);
		// A file that could not be read is tried again at the next boot.
		if (report.failures.length === 0) {
			const next: ILegacyResidueState = {
				registry: fingerprint,
				asked: [...(state?.asked ?? []), ...rendered.asked],
			};
			await options.io.writeText(statePath, `${JSON.stringify(next)}\n`);
		}
		return rendered.lines;
	} catch (error) {
		return [
			`legacy residue: the run was skipped: ${error instanceof Error ? error.message : String(error)}`,
		];
	}
};
