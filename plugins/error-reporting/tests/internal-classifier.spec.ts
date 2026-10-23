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
});
