import type { IDogmaAdapter } from '../contracts';

/**
 * Swift dogma (Swift 5.10 / 6).
 *
 * Single Responsibility: the one place that declares idiomatic Swift.
 */
export const SWIFT_DOGMA: IDogmaAdapter = {
	language: 'swift',
	displayName: 'Swift',
	version: 'swift-5.10',
	packageManager: 'swiftpm',
	ownership: 'arc',
	errorModel: 'exceptions',
	nullSafety: 'optional',
	naming: 'lowerCamelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-immutable',
	testing: 'xunit',
	bullets: [
		'Use `guard` for early-exit so the happy path stays un-indented.',
		'Prefer value types (`struct`/`enum`) over reference types (`class`) unless identity matters.',
		'Handle Optionals explicitly with `if let`/`guard let`/`??`; avoid force-unwrap (`!`) outside tests.',
		'lowerCamelCase for properties/functions, UpperCamelCase for types; prefer `let` over `var`.',
		'Use `async`/`await` and actors for concurrency; mark UI-bound code `@MainActor`.',
		'Run `swiftlint` to lint and `swift-format` (or `swiftlint --fix`) to format.',
	],
};
