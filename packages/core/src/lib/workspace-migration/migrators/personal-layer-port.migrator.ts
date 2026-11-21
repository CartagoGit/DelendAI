/**
 * personal-layer-port.migrator.ts — a personal file keyed without the
 * remote's port takes the name its port gives it.
 *
 * An older delendai dropped the port from a remote's identity, so two
 * servers on one host shared one personal file. The identity keeps the
 * port now; the file of a project whose remote names one is renamed to
 * the new key, once, and only when nothing is there yet — a file under
 * the new name is the person's already and wins.
 */
import { rename, stat } from 'node:fs/promises';

import type {
	IMigration,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';
import { PERSONAL_LAYER_PORT_MIGRATOR_ID } from '../../contracts/constants/personal-layer-schema.constant';
import {
	personalLayerPath,
	portlessIdentity,
	projectIdentity,
} from '../../plugins/personal-layer.service';

const exists = async (path: string): Promise<boolean> =>
	stat(path).then(
		() => true,
		() => false,
	);

/** The migrator, with where personal files live (default: this user's). */
export const createPersonalLayerPortMigrator = (
	personalRoot?: string,
): IMigration => {
	/** The old and new file names, when the old one is to be moved. */
	const move = async (
		workspaceRoot: string,
	): Promise<{ readonly from: string; readonly to: string } | undefined> => {
		const identity = await projectIdentity(workspaceRoot);
		const old = portlessIdentity(identity);
		if (old === undefined) return undefined;
		const from = personalLayerPath(old, personalRoot);
		const to = personalLayerPath(identity, personalRoot);
		return (await exists(from)) && !(await exists(to))
			? { from, to }
			: undefined;
	};
	return {
		id: PERSONAL_LAYER_PORT_MIGRATOR_ID,

		detect: async (ctx) => (await move(ctx.workspaceRoot)) !== undefined,

		plan: async (ctx): Promise<readonly IMigrationPlanStep[]> => {
			const pending = await move(ctx.workspaceRoot);
			return pending === undefined
				? []
				: [
						{
							kind: 'rename-personal-layer-file',
							detail: `the personal file of this project was keyed without its remote's port; it moves to ${pending.to}`,
						},
					];
		},

		apply: async (ctx) => {
			const pending = await move(ctx.workspaceRoot);
			if (pending !== undefined) await rename(pending.from, pending.to);
		},
	};
};
