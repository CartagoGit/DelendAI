/**
 * legacy-residue.migrator.ts — the project-scope entries of the residue
 * registry, run as one workspace migration.
 */
import { readFile, writeFile } from 'node:fs/promises';

import type {
	ILegacyResidueEntry,
	ILegacyResidueIO,
} from '../../contracts/interfaces/legacy-residue.interface';
import type { IMigration } from '../../contracts/interfaces/workspace-migration.interface';
import { LEGACY_RESIDUE_MIGRATOR_ID } from '../../contracts/constants/legacy-residue.constant';
import { legacyResidueRegistry } from './legacy-residue.registry';

const fileSystemIO: ILegacyResidueIO = {
	readText: async (path) =>
		readFile(path, 'utf8').then(
			(text) => text,
			() => undefined,
		),
	writeText: (path, text) => writeFile(path, text, 'utf8'),
};

export const createLegacyResidueMigrator = (
	registry: readonly ILegacyResidueEntry[] = legacyResidueRegistry,
	io: ILegacyResidueIO = fileSystemIO,
): IMigration => {
	const entries = registry.filter((entry) => entry.scope === 'project');
	const present = async (root: string): Promise<ILegacyResidueEntry[]> => {
		const found: ILegacyResidueEntry[] = [];
		for (const entry of entries) {
			if (await entry.detect({ root, io })) found.push(entry);
		}
		return found;
	};
	return {
		id: LEGACY_RESIDUE_MIGRATOR_ID,
		detect: async (ctx) => (await present(ctx.workspaceRoot)).length > 0,
		plan: async (ctx) =>
			(await present(ctx.workspaceRoot)).map((entry) => ({
				kind: entry.kind,
				detail: entry.id,
			})),
		apply: async (ctx) => {
			if (ctx.dryRun) return;
			for (const entry of await present(ctx.workspaceRoot)) {
				await entry.migrate({ root: ctx.workspaceRoot, io });
			}
		},
	};
};
