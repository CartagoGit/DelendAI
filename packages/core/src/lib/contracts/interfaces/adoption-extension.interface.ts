/**
 * Generic extension points for project adoption steps.
 */

export interface IAdoptionExtensionProvider<TContext = void> {
	readonly id: string;
	contribute(
		context: TContext,
	):
		| readonly IAdoptionExtension[]
		| Promise<readonly IAdoptionExtension[] | undefined>
		| undefined;
}

export interface IAdoptionStep {
	readonly title: string;
	readonly detail: string;
	readonly command?: string;
	readonly files?: readonly string[];
}

export interface IAdoptionExtension {
	readonly title: string;
	readonly detail?: string;
	readonly steps: readonly IAdoptionStep[];
}

/** Files one loaded adoption extension adds to an adoption plan. */
export interface IAdoptionFileContribution {
	/** The extension's title, e.g. the plugin that contributes the files. */
	readonly title: string;
	readonly count: number;
}

export function emptyAdoptionExtensions(): readonly IAdoptionExtension[] {
	return Object.freeze([] as const);
}
