/**
 * preset-table.ts — pure render helper for `/es/presets`.
 *
 * Reads the canonical preset catalog from `@mcp-vertex/core` and
 * produces a 2D membership matrix: rows = presets, columns = every
 * plugin id ever mentioned in any preset. Each cell is one of:
 *
 *   - `present`   — the plugin is in the preset's effective membership.
 *   - `hostOnly`  — the plugin is in the preset AND marked hostOnly
 *                   (renders the chip described in f00043 §"Dependency-aware cells").
 *   - `absent`    — the plugin is not in the preset (renders as "—").
 *
 * The output is plain data so the Astro page (and any future consumer
 * — dashboard panel, CLI `mcpv presets list`, etc.) renders it without
 * re-implementing the catalog logic.
 *
 * Pure function: no I/O, no `process.env`, no `fs`. Unit-tested under
 * `apps/web/scripts/__tests__/preset-table.spec.ts`.
 */

import {
	PRESET_CATALOG,
	resolvePresetMembers,
	type IPresetDefinition,
	type IPresetKind,
	type IPresetMember,
} from '@mcp-vertex/core/lib/plugins/preset-catalog';

/** A single cell of the membership matrix. */
export type IPresetCellState = 'present' | 'hostOnly' | 'absent';

/** One row of the matrix. */
export interface IPresetRow {
	readonly preset: IPresetDefinition;
	readonly members: readonly string[];
	readonly effective: readonly string[];
}

/** The whole matrix (rows + ordered plugin column ids). */
export interface IPresetMatrix {
	readonly rows: readonly IPresetRow[];
	readonly columnIds: readonly string[];
}

/** Build the membership matrix from the catalog. */
export const buildPresetMatrix = (): IPresetMatrix => {
	const columnIds: string[] = [];
	const seenCol = new Set<string>();
	for (const def of PRESET_CATALOG) {
		for (const member of def.members) {
			if (!seenCol.has(member.plugin)) {
				seenCol.add(member.plugin);
				columnIds.push(member.plugin);
			}
		}
	}
	const rows: IPresetRow[] = PRESET_CATALOG.map((def) => ({
		preset: def,
		members: def.members.map((m: IPresetMember) => m.plugin),
		effective: [...resolvePresetMembers(def.id as IPresetKind)],
	}));
	return { rows, columnIds };
};

/** Resolve the cell state for one (preset, plugin) pair. */
export const cellStateFor = (
	matrix: IPresetMatrix,
	presetId: IPresetKind | string,
	pluginId: string,
): IPresetCellState => {
	const row = matrix.rows.find((r) => r.preset.id === presetId);
	if (row === undefined) return 'absent';
	const isMember = row.effective.includes(pluginId);
	if (!isMember) return 'absent';
	const def = PRESET_CATALOG.find((d) => d.id === presetId);
	const declaredMember = def?.members.find((m) => m.plugin === pluginId);
	if (declaredMember?.hostOnly === true) return 'hostOnly';
	return 'present';
};

/** Total count of plugins across the matrix (used by the page header). */
export const totalUniquePlugins = (matrix: IPresetMatrix): number =>
	matrix.columnIds.length;
