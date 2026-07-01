import type { IDogmaAdapter } from '../contracts';

/**
 * Visual Basic dogma.
 */
export const VB_DOGMA: IDogmaAdapter = {
	language: 'vb',
	displayName: 'Visual Basic',
	version: 'vb-1.0',
	packageManager: 'nuget',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Visual Basic code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
