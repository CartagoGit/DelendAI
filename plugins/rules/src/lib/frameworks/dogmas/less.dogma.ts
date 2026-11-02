import type { IDogmaAdapter } from '../contracts';

/**
 * Less dogma.
 */
export const LESS_DOGMA: IDogmaAdapter = {
	language: 'less',
	displayName: 'Less',
	version: 'less-1.0',
	packageManager: 'npm',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'snake_case',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Less code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
