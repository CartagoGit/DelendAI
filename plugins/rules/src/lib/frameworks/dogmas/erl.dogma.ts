import type { IDogmaAdapter } from '../contracts';

/**
 * Erlang dogma.
 */
export const ERL_DOGMA: IDogmaAdapter = {
	language: 'erl',
	displayName: 'Erlang',
	version: 'erl-1.0',
	packageManager: 'rebar3',
	ownership: 'gc',
	errorModel: 'exceptions',
	nullSafety: 'nullable-types',
	naming: 'camelCase',
	async: 'async-await',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'xunit',
	bullets: [
		'Write clean, idiomatic Erlang code following standard conventions.',
		'Prefer composition over inheritance and keep functions small.',
		'Ensure proper resource handling and error propagation.',
		'Always write comprehensive tests for your public interface.',
	],
};
