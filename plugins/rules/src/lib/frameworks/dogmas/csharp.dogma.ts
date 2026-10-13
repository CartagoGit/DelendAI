import type { IDogmaAdapter } from '../contracts';

/**
 * C# / .NET dogma (.NET 8, C# 12).
 *
 * Single Responsibility: the one place that declares idiomatic C#.
 */
export const CSHARP_DOGMA: IDogmaAdapter = {
	language: 'cs',
	displayName: 'C#',
	version: 'csharp-12',
	packageManager: 'nuget',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'PascalCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'PascalCase for types/methods/properties, camelCase for locals/parameters, `_camelCase` for private fields.',
		'Enable nullable reference types (`<Nullable>enable</Nullable>`); treat the warnings as errors.',
		'Prefer `async`/`await` over blocking; suffix async methods with `Async` and pass `CancellationToken`.',
		'Use `record` for immutable value types and file-scoped namespaces; prefer expression-bodied members where clear.',
		'Favour LINQ and pattern matching over manual loops and nested `if`/`switch` chains.',
		'Write xUnit/NUnit tests; run `dotnet format` and `dotnet build -warnaserror` before merge.',
	],
};
