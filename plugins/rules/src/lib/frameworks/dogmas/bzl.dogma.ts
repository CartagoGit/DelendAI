import type { IDogmaAdapter } from '../contracts';

/**
 * Starlark dogma.
 */
export const BZL_DOGMA: IDogmaAdapter = {
	language: 'bzl',
	displayName: 'Starlark',
	version: 'bzl-1.0',
	packageManager: 'bazel',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Starlark code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
