import type { IPackId } from '../constants/stack-packs.constant';
import type { IPresetKind } from '../../plugins/preset-catalog';
import type { IRetiredPresetId } from '../constants/retired-preset-ids.constant';

export interface IRetiredPresetResolution {
	readonly retired: IRetiredPresetId;
	readonly replacement: IPresetKind;
	/** The stack overlay the retired id also stood for, if any. */
	readonly stack?: IPackId;
	/** The plugins the replacement resolves to. */
	readonly members: readonly string[];
	/** Plugins the retired id carried that the replacement does not. */
	readonly dropped: readonly string[];
	/** The deprecation line, naming the exact replacement. */
	readonly notice: string;
}

export interface IPresetMigrationInput {
	readonly root: string;
	readonly plugins: Readonly<
		Record<string, { readonly enabled?: boolean } | null>
	>;
	readonly now?: Date | undefined;
}

export interface IPresetMigrationResult {
	/** `recorded` the first time a match is journalled, `unchanged` otherwise. */
	readonly outcome: 'recorded' | 'unchanged';
	readonly match?: IRetiredPresetResolution;
}
