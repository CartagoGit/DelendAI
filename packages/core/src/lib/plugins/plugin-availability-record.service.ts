/**
 * plugin-availability-record.service.ts — what each plugin last said about
 * whether it can work here, kept so every surface reads the same answer.
 *
 * Read right after a plugin registers, with the same context, and kept as
 * one file per plugin in the workspace's records: plugins register side by
 * side, and one shared file would lose all but the last writer. A plugin
 * nobody loaded this start keeps its last answer and the time it was
 * read, instead of being shown as working.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { RECORDS_DIR } from '../contracts/constants/delendai-records.constant';
import type { IPluginAvailability } from '../contracts/interfaces/plugin-availability.interface';
import type { IPluginAvailabilityRecord } from '../contracts/interfaces/plugin-availability-record.interface';
import { provenAvailabilityOf } from './plugin-availability.service';
import type { IMcpPlugin, IMcpPluginContext } from './plugin-contract';

/** Where the answers of one workspace live. */
export const pluginAvailabilityDir = (
	workspaceRoot: string,
	cacheDir: string,
): string => join(workspaceRoot, cacheDir, RECORDS_DIR, 'plugin-availability');

const fileOf = (dir: string, plugin: string): string =>
	join(dir, `${encodeURIComponent(plugin)}.json`);

/**
 * Reads what `plugin` says about itself in `ctx` and keeps it. Keeping it
 * never fails the caller: an answer that could not be written is still
 * returned.
 */
export const readAndRecordAvailability = async (
	plugin: Pick<IMcpPlugin, 'name' | 'availability' | 'probe'>,
	ctx: IMcpPluginContext,
	now: () => Date = () => new Date(),
): Promise<IPluginAvailability> => {
	const availability = await provenAvailabilityOf(plugin, ctx, now);
	const record: IPluginAvailabilityRecord = {
		plugin: plugin.name,
		...availability,
		readAt: now().toISOString(),
	};
	try {
		const dir = pluginAvailabilityDir(ctx.workspace.root, ctx.cacheDir);
		await mkdir(dir, { recursive: true });
		await writeFile(
			fileOf(dir, plugin.name),
			`${JSON.stringify(record, null, '\t')}\n`,
		);
	} catch {
		// Answered all the same; kept again on the next registration.
	}
	return availability;
};

/** Every answer kept in the workspace, by plugin name. */
export const readPluginAvailabilities = async (
	workspaceRoot: string,
	cacheDir: string,
): Promise<readonly IPluginAvailabilityRecord[]> => {
	const dir = pluginAvailabilityDir(workspaceRoot, cacheDir);
	let names: string[];
	try {
		names = await readdir(dir);
	} catch {
		return [];
	}
	const records: IPluginAvailabilityRecord[] = [];
	for (const name of names.filter((entry) => entry.endsWith('.json'))) {
		try {
			records.push(
				JSON.parse(
					await readFile(join(dir, name), 'utf8'),
				) as IPluginAvailabilityRecord,
			);
		} catch {
			// A file cut short by a crash is read again once rewritten.
		}
	}
	return records.sort((left, right) =>
		left.plugin.localeCompare(right.plugin),
	);
};
