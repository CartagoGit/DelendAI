import { describe, expect, it } from 'vitest';

import {
	extractSafeMcpFrames,
	packageIdFromSafeFrame,
	registerInternalPath,
	resetInternalPathRegistry,
} from '../src/lib/frame-extractor.helper';

describe('extractSafeMcpFrames', () => {
	it('keeps only @delendai frames and registered internal monorepo paths', () => {
		resetInternalPathRegistry();
		registerInternalPath('/home/user/acme');
		registerInternalPath('/home/user/acme/node_modules/@delendai');
		const error = new Error('boom');
		error.stack = [
			'Error: boom',
			'    at hostFn (/home/user/acme/src/app.ts:4:2)',
			'    at report (/home/user/acme/node_modules/@delendai/error-reporting/dist/index.js:12:3)',
			'    at helper (/home/user/acme/plugins/error-reporting/src/lib/index.ts:22:8)',
		].join('\n');

		const frames = extractSafeMcpFrames(error);
		expect(frames).toEqual([
			{
				file: '@delendai/error-reporting/dist/index.js',
				line: 12,
				col: 3,
				fn: 'report',
			},
			{
				file: '@delendai/error-reporting/src/lib/index.ts',
				line: 22,
				col: 8,
				fn: 'helper',
			},
		]);
	});

	it('never returns consumer absolute paths', () => {
		resetInternalPathRegistry();
		const error = new Error('boom');
		error.stack = [
			'Error: boom',
			'    at hostFn (C:\\Users\\alice\\corp\\src\\app.ts:4:2)',
			'    at hostFnTwo (/home/alice/corp/src/app.ts:8:9)',
		].join('\n');
		expect(extractSafeMcpFrames(error)).toEqual([]);
	});

	it('derives a package id from a safe frame', () => {
		expect(
			packageIdFromSafeFrame({
				file: '@delendai/error-reporting/src/index.ts',
			}),
		).toBe('@delendai/error-reporting');
	});

	it('reads a frame with no function name', () => {
		resetInternalPathRegistry();
		registerInternalPath('/repo');
		const error = new Error('boom');
		error.stack = [
			'Error: boom',
			'    at /repo/plugins/x/src/a.ts:9:4',
		].join('\n');

		expect(extractSafeMcpFrames(error)).toEqual([
			{ file: '@delendai/x/src/a.ts', line: 9, col: 4 },
		]);
	});

	it('stays linear on a frame line made of spaces', () => {
		// The pattern this replaced put two lazy `.+?` either side of a
		// `\s+` they could both match, so a long line cost the square of
		// its length. The line below is not a frame; the point is how
		// fast it is refused.
		resetInternalPathRegistry();
		const spaces = ' '.repeat(40_000);
		const error = new Error('boom');
		error.stack = `Error: boom\n    at fn (${spaces}`;
		const started = Date.now();

		expect(extractSafeMcpFrames(error)).toEqual([]);

		expect(Date.now() - started).toBeLessThan(2_000);
	});
});
