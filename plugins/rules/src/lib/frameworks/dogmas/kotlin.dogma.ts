import type { IDogmaAdapter } from '../contracts';

/**
 * Kotlin dogma (Kotlin 2.0).
 *
 * Single Responsibility: the one place that declares idiomatic Kotlin.
 */
export const KOTLIN_DOGMA: IDogmaAdapter = {
	language: 'kt',
	displayName: 'Kotlin',
	version: 'kotlin-2.0',
	packageManager: 'gradle',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'PascalCase',
	async: 'coroutines',
	visibility: 'public',
	immutability: 'default-immutable',
	testing: 'xunit',
	bullets: [
		'Use `val` over `var`; reach for `var` only when the binding genuinely reassigns.',
		'Embrace null safety: prefer `?.`/`?:`/`let` over `!!`; let the type system track nullability.',
		'Coroutines (`suspend`/structured concurrency) over raw threads for concurrency.',
		'PascalCase for classes, camelCase for functions/properties; prefer `data class` for value types.',
		'Favour expression bodies, extension functions, and sealed hierarchies over Java-style boilerplate.',
		'Run `ktlint` to enforce style and `detekt` for static analysis before merge.',
	],
};
