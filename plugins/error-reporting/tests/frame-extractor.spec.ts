import { describe, expect, it } from 'vitest';

import {
	extractSafeMcpFrames,
	packageIdFromSafeFrame,
	registerInternalPath,
	resetInternalPathRegistry,
} from '../src/lib/frame-extractor.helper';

describe('extractSafeMcpFrames', () => {
	it('keeps only @mcp-vertex frames and registered internal monorepo paths', () => {
		resetInternalPathRegistry();
		registerInternalPath('/home/user/acme');
		registerInternalPath('/home/user/acme/node_modules/@mcp-vertex');
		const error = new Error('boom');
		error.stack = [
			'Error: boom',
			'    at hostFn (/home/user/acme/src/app.ts:4:2)',
			'    at report (/home/user/acme/node_modules/@mcp-vertex/error-reporting/dist/index.js:12:3)',
			'    at helper (/home/user/acme/plugins/error-reporting/src/lib/index.ts:22:8)',
		].join('\n');

		const frames = extractSafeMcpFrames(error);
		expect(frames).toEqual([
			{
				file: '@mcp-vertex/error-reporting/dist/index.js',
				line: 12,
				col: 3,
				fn: 'report',
			},
			{
				file: '@mcp-vertex/error-reporting/src/lib/index.ts',
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
				file: '@mcp-vertex/error-reporting/src/index.ts',
			}),
		).toBe('@mcp-vertex/error-reporting');
	});
});
