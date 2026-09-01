import {
	detectModelTier,
	getModelProfile,
	type IModelProfile,
	type IModelProfileOverride,
} from './model-profiles';

export interface IModelProfileSelectionOptions {
	readonly tierHint?: string | null;
	readonly profileId?: string;
	readonly overrides?: Readonly<Record<string, IModelProfileOverride>>;
}

/** Resolve the profile used for the initial tool surface. */
export const selectModelProfile = (
	options: IModelProfileSelectionOptions = {},
): IModelProfile =>
	getModelProfile(
		options.profileId ?? detectModelTier(options.tierHint),
		options.overrides,
	);
