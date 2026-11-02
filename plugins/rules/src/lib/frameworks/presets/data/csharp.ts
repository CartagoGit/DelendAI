import type { IRulePreset } from '../../contracts';

/**
 * C# / .NET (dotnet format) preset — DATA only.
 *
 * Single Responsibility: the baseline `.editorconfig` analyzer
 * section + bullets for C#. The project's own `.editorconfig` wins;
 * `dotnet build` is the typecheck.
 */
export const CSHARP_PRESET: IRulePreset = {
	id: 'csharp-dotnet',
	framework: 'dotnet',
	language: 'cs',
	linter: 'dotnet-format',
	linterConfigFile: 'csharp-dotnet.editorconfig',
	linterConfigContent: `# Baseline .NET analyzer config (the project's own .editorconfig wins).
[*.cs]
dotnet_diagnostic.CA1822.severity = suggestion
csharp_style_namespace_declarations = file_scoped:warning
`,
	conventions: [
		'PascalCase for types/methods/properties, camelCase for locals/parameters.',
		'Enable nullable reference types; treat `Nullable<T>` warnings as errors.',
		'Prefer `async`/`await` over blocking; suffix async methods with `Async`.',
		'Run `dotnet format` to fix and `dotnet build -warnaserror` to verify.',
	],
	requiredLinterDeps: ['dotnet'],
};
