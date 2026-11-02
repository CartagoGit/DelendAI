import type { IDogmaAdapter } from '../contracts';

/**
 * LFE dogma.
 */
export const LFE_DOGMA: IDogmaAdapter = {
	language: 'lfe',
	displayName: 'LFE',
	version: 'lfe-1.0',
	packageManager: 'lfe',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic LFE code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
