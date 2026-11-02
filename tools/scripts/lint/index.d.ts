export interface ILintScriptRegistration {
	readonly id: string;
	readonly command: string;
	readonly scriptPath: string;
	readonly scope: string;
	readonly description: string;
	readonly gate: 'manual' | 'validate';
}
export declare const LINT_SCRIPT_REGISTRY: readonly ILintScriptRegistration[];
export declare const findLintScriptRegistration: (
	id: string,
) => ILintScriptRegistration | undefined;
