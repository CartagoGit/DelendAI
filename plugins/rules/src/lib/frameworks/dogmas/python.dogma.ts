import type { IDogmaAdapter } from '../contracts';

/**
 * Python dogma (Python 3.12).
 *
 * Single Responsibility: this file is the *only* place that
 * declares the idiomatic style of Python. Consumers read the
 * `IDogmaAdapter` resolved from `DogmaRegistry` — never this
 * file directly (Dependency Inversion).
 */
export const PYTHON_DOGMA: IDogmaAdapter = {
	language: 'py',
	displayName: 'Python',
	version: 'python-3.12',
	packageManager: 'pip',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'null',
	naming: 'snake_case',
	async: 'async-await',
	visibility: 'no-modifier',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Use `from __future__ import annotations`; annotate every public signature.',
		'Prefer EAFP (`try/except`) over LBYL (pre-checking) for Pythonic control flow.',
		'snake_case for functions and variables, PascalCase for classes, UPPER_SNAKE for constants.',
		'Reach for comprehensions and generators before manual `for`-append loops.',
		'Prefer `pathlib.Path` over `os.path`; prefer f-strings over `%`/`.format()`.',
		'Use `@dataclass(frozen=True)` for value objects; mutate state only where intended.',
	],
};
