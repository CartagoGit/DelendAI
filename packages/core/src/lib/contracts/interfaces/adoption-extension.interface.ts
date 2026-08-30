/**
 * Generic extension points for project adoption steps.
 */

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
