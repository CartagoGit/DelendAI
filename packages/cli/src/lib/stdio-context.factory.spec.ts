/**
 * Which file the CLI spawns as its server.
 *
 * This was a ladder of four guesses, every rung describing the
 * development layout. From the built bundle in a consumer project all
 * four were missing, so the shipped CLI could not start its own server —
 * which is every consumer.
 */
import { describe, expect, it } from 'vitest';

import { resolveServerEntrypoint } from './stdio-context.factory';

describe('resolveServerEntrypoint (x00612)', () => {
	it('spawns the binary that is already running', () => {
		// `__serve` is handled by this same entrypoint in both layouts:
		// from source it is the .ts, installed it is the bundle.
		expect(resolveServerEntrypoint({}, ['bun', import.meta.filename])).toBe(
			import.meta.filename,
		);
	});

	it('lets a host say so explicitly, and prefers that over anything', () => {
		expect(
			resolveServerEntrypoint({ DELENDAI_SERVER_BIN: '/opt/delendai' }, [
				'bun',
				import.meta.filename,
			]),
		).toBe('/opt/delendai');
	});

	it('refuses, naming the override, when the entrypoint is not on disk', () => {
		// Guessing here is what produced four wrong answers.
		expect(() =>
			resolveServerEntrypoint({}, ['bun', '/nowhere/that/exists.js']),
		).toThrow(/DELENDAI_SERVER_BIN/u);
	});

	it('refuses when the process hides its own entrypoint', () => {
		expect(() => resolveServerEntrypoint({}, ['bun'])).toThrow(
			/does not expose its own entrypoint/u,
		);
	});

	it('treats an empty override as no override', () => {
		expect(
			resolveServerEntrypoint({ DELENDAI_SERVER_BIN: '' }, [
				'bun',
				import.meta.filename,
			]),
		).toBe(import.meta.filename);
	});
});
