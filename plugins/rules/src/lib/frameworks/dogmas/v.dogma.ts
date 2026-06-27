import type { IDogmaAdapter } from '../contracts';

/**
 * V dogma.
 */
export const V_DOGMA: IDogmaAdapter = {
	language: 'v',
	displayName: 'V',
	version: 'v-1.0',
	packageManager: 'v',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic V code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
