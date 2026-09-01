export interface ILintScriptRegistration {
	readonly id: string;
	readonly command: string;
	readonly scriptPath: string;
	readonly scope: string;
	readonly description: string;
	readonly gate: 'manual' | 'validate';
}

export const LINT_SCRIPT_REGISTRY: readonly ILintScriptRegistration[] = [
	{
		id: 'core-proposals-boundary',
		command: 'bun tools/scripts/lint/core-proposals-boundary.script.ts',
		scriptPath: 'tools/scripts/lint/core-proposals-boundary.script.ts',
		scope: 'packages/core/src',
		description:
			'Prevents new proposals-domain imports, path literals and workflow strings from entering packages/core/src without a time-boxed exception.',
		gate: 'manual',
	},
] as const;

export const findLintScriptRegistration = (
	id: string,
): ILintScriptRegistration | undefined =>
	LINT_SCRIPT_REGISTRY.find((entry) => entry.id === id);
