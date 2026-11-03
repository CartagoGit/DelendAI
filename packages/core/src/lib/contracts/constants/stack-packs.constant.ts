import type { IPresetKind } from '../../plugins/preset-catalog';

/**
 * The stack overlays. A stack is not a preset of its own: it is a purpose
 * pack (`basePack`) plus the few plugins its stack needs (`plugins`, each
 * with its dependencies already in the base pack or listed here) and the
 * tuned option defaults of `PACK_DEFAULTS_OVERLAY`.
 */
export const STACK_PACKS = {
	'web-app': { basePack: 'solo', plugins: ['i18n', 'web-fetch'] },
	'backend-api': { basePack: 'solo', plugins: ['container', 'database'] },
	'cli-tool': { basePack: 'solo', plugins: ['perf'] },
} as const satisfies Record<
	string,
	{ readonly basePack: IPresetKind; readonly plugins: readonly string[] }
>;

/** The valid stack overlay ids. */
export type IPackId = keyof typeof STACK_PACKS;
