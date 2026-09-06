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

export function emptyAdoptionExtensions(): readonly IAdoptionExtension[] {
	return Object.freeze([] as const);
}
