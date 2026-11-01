import type { IDogmaAdapter } from '../contracts';

/**
 * Objective-C++ dogma.
 */
export const OBJCPP_DOGMA: IDogmaAdapter = {
	language: 'objcpp',
	displayName: 'Objective-C++',
	version: 'objcpp-1.0',
	packageManager: 'make',
	ownership: 'manual',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'snake_case',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Objective-C++ code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
