/**
 * repair-resolutions-seam.ts — the tracked file behind
 * `IRepairResolutionsSource`.
 *
 * WHY the read happens here and not inside the reconciler: the
 * reconciler is a pure function of its seams, and the gate is the one
 * place that already knows where the workspace is on disk. Reading the
 * file up front — once, asynchronously — keeps `read()` synchronous and
 * total for the phase that consumes it, exactly as the state-database
 * seam does.
 *
 * WHY an unreadable or malformed file resolves NOTHING and does not
 * fail the boot: a decision that cannot be read is a decision that was
 * not taken. Blockers stand, the parse errors are reported, and the
 * operator sees why their file was ignored instead of silently getting
 * a green boot out of a typo.
 */

import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import {
	parseRepairResolutions,
	REPAIR_RESOLUTIONS_PATH,
	staticRepairResolutions,
} from '../startup-reconciler/index';

import type { IRepairResolutionsSeam } from './repair-resolutions-seam.interface';

export type { IRepairResolutionsSeam } from './repair-resolutions-seam.interface';

/** Absolute path of the tracked file for a workspace. */
export const repairResolutionsPath = (workspaceRoot: string): string =>
	isAbsolute(REPAIR_RESOLUTIONS_PATH)
		? REPAIR_RESOLUTIONS_PATH
		: join(workspaceRoot, REPAIR_RESOLUTIONS_PATH);

/**
 * Read the workspace's recorded decisions. An absent file is the normal
 * case (no decision has ever been needed) and reports no errors.
 */
export const createRepairResolutionsSeam = async (input: {
	readonly workspaceRoot: string;
	readonly read?: (path: string) => Promise<string>;
}): Promise<IRepairResolutionsSeam> => {
	const path = repairResolutionsPath(input.workspaceRoot);
	const readText = input.read ?? ((target) => readFile(target, 'utf8'));
	let raw: string;
	try {
		raw = await readText(path);
	} catch (error) {
		const code =
			typeof error === 'object' && error !== null && 'code' in error
				? String((error as { code?: unknown }).code)
				: '';
		return {
			source: staticRepairResolutions([]),
			errors:
				code === 'ENOENT'
					? []
					: [
							`${REPAIR_RESOLUTIONS_PATH}: ${error instanceof Error ? error.message : 'unreadable'}`,
						],
		};
	}
	const parsed = parseRepairResolutions(raw);
	return {
		source: staticRepairResolutions(parsed.resolutions),
		errors: parsed.errors,
	};
};
