import { describe, expect, it } from 'vitest';

import { buildSyntheticExample } from '../src/lib/synthetic-example.builder';
import {
	buildIssueBody,
	buildIssueTitle,
	classificationOf,
	isDelendaiInternal,
	registerInternalPath,
	resetInternalPathRegistry,
	safeFailureClassOf,
	signatureOf,
} from '../src/lib/signature.helper';
import { extractSafeMcpFrames } from '../src/lib/frame-extractor.helper';
import { DelendaiInternalError } from '../src/lib/contracts/interfaces/reporter.interface';

describe('isDelendaiInternal', () => {
	it('detects a stack trace originating inside delendai', () => {
		const error = new Error('invariant violated');
		error.stack = [
			'Error: invariant violated',
			'    at Plugin.register (/home/u/app/node_modules/@delendai/issues/dist/index.js:12:3)',
		].join('\n');
		expect(isDelendaiInternal(error)).toBe(true);
	});

	it('detects the package scope in the message alone', () => {
		const error = new DelendaiInternalError({
			code: 'PLUGIN_LOAD_FAILED',
			packageId: '@delendai/issues',
			componentId: 'loader',
		});
		expect(isDelendaiInternal(error)).toBe(true);
	});

	it('ignores host-project failures with no delendai marker', () => {
		const error = new Error("Cannot read file './src/app.ts'");
		error.stack = [
			'Error: Cannot read file',
			'    at doThing (/home/u/app/src/app.ts:4:2)',
		].join('\n');
		expect(isDelendaiInternal(error)).toBe(false);
	});
});

describe('safeFailureClassOf / classificationOf / signatureOf', () => {
	it('classifies typed timeout errors as performance', () => {
		const error = new DelendaiInternalError({
			code: 'PLUGIN_REGISTER_TIMEOUT',
			packageId: '@delendai/error-reporting',
			componentId: 'register',
		});
		expect(safeFailureClassOf(error)).toBe('INTERNAL_TIMEOUT');
		expect(
			classificationOf({
				toolId: 'quality_run_quality',
				packageId: error.packageId,
				componentId: error.componentId,
				errorCode: error.code,
				failureClass: safeFailureClassOf(error),
			}),
		).toBe('PERFORMANCE');
	});

	it('produces the same signature across different workspace roots for the same internal bug', () => {
		resetInternalPathRegistry();
		registerInternalPath('/home/user/project-a');
		registerInternalPath('/srv/build/project-b');
		const leftError = new Error('workspace a');
		leftError.stack = [
			'Error: workspace a',
			'    at report (/home/user/project-a/plugins/error-reporting/src/index.ts:10:2)',
		].join('\n');
		const rightError = new Error('workspace b');
		rightError.stack = [
			'Error: workspace b',
			'    at report (/srv/build/project-b/plugins/error-reporting/src/index.ts:10:2)',
		].join('\n');
		const a = signatureOf({
			delendaiVersion: '0.7.5',
			packageId: '@delendai/error-reporting',
			toolId: 'quality_run_quality',
			errorCode: 'PLUGIN_REGISTER_TIMEOUT',
			failureClass: 'INTERNAL_TIMEOUT',
			classification: 'PERFORMANCE',
			mcpFrames: extractSafeMcpFrames(leftError),
		});
		const b = signatureOf({
			delendaiVersion: '0.7.9',
			packageId: '@delendai/error-reporting',
			toolId: 'quality_run_quality',
			errorCode: 'PLUGIN_REGISTER_TIMEOUT',
			failureClass: 'INTERNAL_TIMEOUT',
			classification: 'PERFORMANCE',
			mcpFrames: extractSafeMcpFrames(rightError),
		});
		expect(a).toBe(b);
	});

	it('differs across safe package identities', () => {
		const left = signatureOf({
			delendaiVersion: '0.1.0',
			packageId: '@delendai/error-reporting',
			toolId: 'search_search',
			failureClass: 'INTERNAL_RUNTIME_ERROR',
			classification: 'BUG',
			mcpFrames: [{ file: '@delendai/error-reporting/src/index.ts' }],
		});
		const right = signatureOf({
			delendaiVersion: '0.1.0',
			packageId: '@delendai/core',
			toolId: 'search_search',
			failureClass: 'INTERNAL_RUNTIME_ERROR',
			classification: 'BUG',
			mcpFrames: [{ file: '@delendai/core/src/index.ts' }],
		});
		expect(left).not.toBe(right);
	});

	it('collapses the same internal bug even when runtime message and values differ', () => {
		const left = signatureOf({
			delendaiVersion: '0.1.0',
			packageId: '@delendai/error-reporting',
			componentId: 'src/index.ts',
			toolId: 'search_search',
			errorCode: 'PLUGIN_REGISTER_TIMEOUT',
			failureClass: 'INTERNAL_TIMEOUT',
			classification: 'PERFORMANCE',
			mcpFrames: [
				{
					file: '@delendai/error-reporting/src/index.ts',
					line: 11,
					col: 2,
				},
			],
		});
		const right = signatureOf({
			delendaiVersion: '0.1.0',
			packageId: '@delendai/error-reporting',
			componentId: 'src/index.ts',
			toolId: 'search_search',
			errorCode: 'PLUGIN_REGISTER_TIMEOUT',
			failureClass: 'INTERNAL_TIMEOUT',
			classification: 'PERFORMANCE',
			mcpFrames: [
				{
					file: '@delendai/error-reporting/src/index.ts',
					line: 11,
					col: 2,
					fn: 'sameBugWithDifferentRuntimeData',
				},
			],
		});
		expect(left).toBe(right);
	});

	it('does not collapse different bugs that share only the error code', () => {
		const left = signatureOf({
			delendaiVersion: '0.1.0',
			packageId: '@delendai/error-reporting',
			componentId: 'src/index.ts',
			toolId: 'search_search',
			errorCode: 'PLUGIN_REGISTER_TIMEOUT',
			failureClass: 'INTERNAL_TIMEOUT',
			classification: 'PERFORMANCE',
			mcpFrames: [
				{
					file: '@delendai/error-reporting/src/index.ts',
					line: 11,
					col: 2,
				},
			],
		});
		const right = signatureOf({
			delendaiVersion: '0.1.0',
			packageId: '@delendai/error-reporting',
			componentId: 'src/lib/report-store.service.ts',
			toolId: 'search_search',
			errorCode: 'PLUGIN_REGISTER_TIMEOUT',
			failureClass: 'INTERNAL_TIMEOUT',
			classification: 'PERFORMANCE',
			mcpFrames: [
				{
					file: '@delendai/error-reporting/src/lib/report-store.service.ts',
					line: 11,
					col: 2,
				},
			],
		});
		expect(left).not.toBe(right);
	});
});

describe('buildIssueTitle / buildIssueBody', () => {
	const report = {
		reporterVersion: '0.1.0',
		delendaiVersion: '0.1.0',
		packageId: '@delendai/error-reporting',
		toolOwner: 'host-project',
		toolCategory: 'host-specific',
		errorCode: 'PLUGIN_REGISTER_TIMEOUT',
		failureClass: 'INTERNAL_TIMEOUT',
		classification: 'PERFORMANCE',
		fingerprint: 'abc123',
		mcpFrames: [
			{
				file: '@delendai/error-reporting/src/index.ts',
				line: 1,
				col: 2,
			},
		],
		syntheticExample: {
			summary:
				'Synthetic bakery reproduction for PLUGIN_REGISTER_TIMEOUT.',
			source: 'fixture-fallback',
			fixtureId: 'bakery',
			fixtureDomain: 'bakery',
			argumentType: 'object',
			payload: {
				orderId: 'EXAMPLE-001',
				endpoint: 'https://example.invalid/orders',
			},
		},
	} as const;

	it('prefixes the title and bounds its length', () => {
		const title = buildIssueTitle(report);
		expect(
			title.startsWith('[auto] PERFORMANCE @delendai/error-reporting:'),
		).toBe(true);
		expect(title.length).toBeLessThanOrEqual(180);
	});

	it('renders safe DTO detail and opt-in instructions', () => {
		const body = buildIssueBody(report);
		expect(body).toContain('Automatic error report');
		expect(body).toContain('PLUGIN_REGISTER_TIMEOUT');
		expect(body).toContain('@delendai/error-reporting/src/index.ts:1:2');
		expect(body).toContain('Synthetic bakery reproduction');
		expect(body).toContain('EXAMPLE-001');
		expect(body).toContain('Tool owner');
		expect(body).not.toContain('Error: boom');
		expect(body).toContain('"enabled": true');
	});
});

describe('buildSyntheticExample', () => {
	it('builds deterministic fixture fallback examples without real payload input', () => {
		const left = buildSyntheticExample({
			packageId: '@delendai/error-reporting',
			toolName: 'quality_run_quality',
			errorCode: 'PROCESS_TIMEOUT',
			failureClass: 'INTERNAL_TIMEOUT',
		});
		const right = buildSyntheticExample({
			packageId: '@delendai/error-reporting',
			toolName: 'quality_run_quality',
			errorCode: 'PROCESS_TIMEOUT',
			failureClass: 'INTERNAL_TIMEOUT',
		});
		expect(left).toEqual(right);
		expect(JSON.stringify(left)).toContain('example.invalid');
		expect(JSON.stringify(left)).toMatch(
			/EXAMPLE-001|DEMO-123|SYNTHETIC-42/,
		);
	});

	it('projects schema-shaped payloads from fixtures when a schema is available', () => {
		const example = buildSyntheticExample({
			packageId: '@delendai/error-reporting',
			toolName: 'docs_docs_read',
			errorCode: 'INVALID_OPTIONS',
			failureClass: 'INTERNAL_VALIDATION_ERROR',
			toolSchema: {
				type: 'object',
				properties: {
					endpoint: { type: 'string' },
					requestId: { type: 'string' },
					windowHours: { type: 'number' },
					includeAlerts: { type: 'boolean' },
				},
			},
		});
		expect(example.source).toBe('schema-fixture');
		expect(example.argumentType).toBe('object');
		expect(example.payload).toEqual({
			endpoint: expect.stringMatching(
				/https:\/\/example\.(invalid|com)\//,
			),
			requestId: expect.stringMatching(
				/EXAMPLE-001|DEMO-123|SYNTHETIC-42/,
			),
			windowHours: expect.any(Number),
			includeAlerts: expect.any(Boolean),
		});
	});
});
