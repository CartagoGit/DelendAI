import type { IDogmaAdapter } from '../contracts';

/**
 * Lean dogma.
 */
export const LEAN_DOGMA: IDogmaAdapter = {
	language: 'lean',
	displayName: 'Lean',
	version: 'lean-1.0',
	packageManager: 'lake',
	ownership: 'gc',
	errorModel: 'sum-types',
	nullSafety: 'option',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-immutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Lean code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
