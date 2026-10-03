import type { IDogmaAdapter } from '../contracts';

/**
 * Org Mode dogma.
 */
export const ORG_DOGMA: IDogmaAdapter = {
	language: 'org',
	displayName: 'Org Mode',
	version: 'org-1.0',
	packageManager: 'emacs',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Org Mode code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
