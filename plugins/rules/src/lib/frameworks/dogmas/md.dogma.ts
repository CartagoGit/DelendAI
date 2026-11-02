import type { IDogmaAdapter } from '../contracts';

/**
 * Markdown dogma.
 */
export const MD_DOGMA: IDogmaAdapter = {
	language: 'md',
	displayName: 'Markdown',
	version: 'md-1.0',
	packageManager: 'npm',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Markdown code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
