/** One gate `delendai validate` runs: where it was declared, and what. */
export interface IValidateStep {
	readonly scope: string;
	readonly command: string;
}
