import type { IDogmaAdapter } from '../contracts';

/**
 * Perl dogma.
 */
export const PL_DOGMA: IDogmaAdapter = {
	language: 'pl',
	displayName: 'Perl',
	version: 'pl-1.0',
	packageManager: 'cpan',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Perl code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
