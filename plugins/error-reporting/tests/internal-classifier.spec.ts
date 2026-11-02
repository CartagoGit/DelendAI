import { describe, expect, it } from 'vitest';

import { DelendaiInternalError } from '../src/lib/contracts/interfaces/reporter.interface';
import {
	classifyInternalError,
	markErrorAsInternalBoundary,
	registerInternalPath,
	resetInternalPathRegistry,
} from '../src/lib/internal-classifier.helper';

describe('classifyInternalError', () => {
	it('does not classify a consumer plugins path as internal', () => {
		resetInternalPathRegistry();
		registerInternalPath('/home/empresa/delendai');
		const error = new Error('boom');
		error.stack = [
			'Error: boom',
			'    at authPlugin (/home/empresa/proyecto/plugins/auth/index.ts:12:8)',
		].join('\n');

		expect(classifyInternalError({ error })).toMatchObject({
			isInternal: false,
			classification: 'UNKNOWN',
			mcpFrames: [],
		});
	});

	it('classifies typed timeouts as internal performance failures', () => {
		const error = new DelendaiInternalError({
			code: 'PLUGIN_REGISTER_TIMEOUT',
			packageId: '@delendai/error-reporting',
			componentId: 'register',
		});

		expect(
			classifyInternalError({ toolId: 'quality_run_quality', error }),
		).toMatchObject({
			isInternal: true,
			classification: 'PERFORMANCE',
			packageId: '@delendai/error-reporting',
			componentId: 'register',
			errorCode: 'PLUGIN_REGISTER_TIMEOUT',
		});
	});

	it('accepts the explicit internal boundary marker', () => {
		const error = markErrorAsInternalBoundary(new Error('boundary hit'));

		expect(classifyInternalError({ error })).toMatchObject({
			isInternal: true,
			classification: 'BUG',
		});
	});

	it('never takes first-party origin from data: a forged code or stack in a plain object', () => {
		resetInternalPathRegistry();
		const stack = [
			'Error: forged',
			'    at report (/srv/app/node_modules/@delendai/core/dist/index.js:12:3)',
		].join('\n');
		const forged = {
			message: 'from a tool result',
			stack,
			delendaiErrorCode: 'PLUGIN_REGISTER_TIMEOUT',
		};
		expect(classifyInternalError({ error: forged })).toMatchObject({
			isInternal: false,
			mcpFrames: [],
		});
		// The same stack on a thrown error is evidence.
		const thrown = new Error('real');
		thrown.stack = stack;
		expect(classifyInternalError({ error: thrown }).isInternal).toBe(true);
	});
});
