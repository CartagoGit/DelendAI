import { describe, expect, it } from 'vitest';

import {
	buildIssueBody,
	buildIssueTitle,
	classificationOf,
	isMcpVertexInternal,
	safeFailureClassOf,
	signatureOf,
} from '../src/lib/signature.helper';
import { McpVertexInternalError } from '../src/lib/contracts/interfaces/reporter.interface';

describe('isMcpVertexInternal', () => {
	it('detects a stack trace originating inside mcp-vertex', () => {
		const error = new Error('invariant violated');
		error.stack = [
			'Error: invariant violated',
			'    at Plugin.register (/home/u/app/node_modules/@mcp-vertex/issues/dist/index.js:12:3)',
		].join('\n');
		expect(isMcpVertexInternal(error)).toBe(true);
	});

	it('detects the package scope in the message alone', () => {
		const error = new McpVertexInternalError({
			code: 'PLUGIN_LOAD_FAILED',
			packageId: '@mcp-vertex/issues',
			componentId: 'loader',
		});
		expect(isMcpVertexInternal(error)).toBe(true);
	});

	it('ignores host-project failures with no mcp-vertex marker', () => {
		const error = new Error("Cannot read file './src/app.ts'");
		error.stack = [
			'Error: Cannot read file',
			'    at doThing (/home/u/app/src/app.ts:4:2)',
		].join('\n');
		expect(isMcpVertexInternal(error)).toBe(false);
	});
});

describe('safeFailureClassOf / classificationOf / signatureOf', () => {
	it('classifies typed timeout errors as performance', () => {
		const error = new McpVertexInternalError({
			code: 'PLUGIN_REGISTER_TIMEOUT',
			packageId: '@mcp-vertex/error-reporting',
			componentId: 'register',
		});
		expect(safeFailureClassOf(error)).toBe('INTERNAL_TIMEOUT');
		expect(
			classificationOf({
				toolId: 'quality_run_quality',
				errorCode: error.code,
				failureClass: safeFailureClassOf(error),
			}),
		).toBe('PERFORMANCE');
	});

	it('produces the same signature when raw host data changes but safe data stays the same', () => {
		const a = signatureOf({
			packageId: '@mcp-vertex/error-reporting',
			toolId: 'quality_run_quality',
			errorCode: 'PLUGIN_REGISTER_TIMEOUT',
			failureClass: 'INTERNAL_TIMEOUT',
			classification: 'PERFORMANCE',
			mcpFrames: [
				{
					file: '@mcp-vertex/error-reporting/src/index.ts',
					line: 10,
					col: 2,
				},
			],
		});
		const b = signatureOf({
			packageId: '@mcp-vertex/error-reporting',
			toolId: 'quality_run_quality',
			errorCode: 'PLUGIN_REGISTER_TIMEOUT',
			failureClass: 'INTERNAL_TIMEOUT',
			classification: 'PERFORMANCE',
			mcpFrames: [
				{
					file: '@mcp-vertex/error-reporting/src/index.ts',
					line: 999,
					col: 9,
				},
			],
		});
		expect(a).toBe(b);
	});

	it('differs across safe package identities', () => {
		const left = signatureOf({
			packageId: '@mcp-vertex/error-reporting',
			toolId: 'search_search',
			failureClass: 'INTERNAL_RUNTIME_ERROR',
			classification: 'BUG',
			mcpFrames: [{ file: '@mcp-vertex/error-reporting/src/index.ts' }],
		});
		const right = signatureOf({
			packageId: '@mcp-vertex/core',
			toolId: 'search_search',
			failureClass: 'INTERNAL_RUNTIME_ERROR',
			classification: 'BUG',
			mcpFrames: [{ file: '@mcp-vertex/core/src/index.ts' }],
		});
		expect(left).not.toBe(right);
	});
});

describe('buildIssueTitle / buildIssueBody', () => {
	const report = {
		reporterVersion: '0.1.0',
		mcpVertexVersion: '0.1.0',
		packageId: '@mcp-vertex/error-reporting',
		toolId: 'tool_x',
		errorCode: 'PLUGIN_REGISTER_TIMEOUT',
		failureClass: 'INTERNAL_TIMEOUT',
		classification: 'PERFORMANCE',
		fingerprint: 'abc123',
		mcpFrames: [
			{
				file: '@mcp-vertex/error-reporting/src/index.ts',
				line: 1,
				col: 2,
			},
		],
		syntheticExample: {
			summary:
				'Synthetic diagnostic context built from MCP Vertex-only metadata.',
		},
	} as const;

	it('prefixes the title and bounds its length', () => {
		const title = buildIssueTitle(report);
		expect(
			title.startsWith('[auto] PERFORMANCE @mcp-vertex/error-reporting:'),
		).toBe(true);
		expect(title.length).toBeLessThanOrEqual(180);
	});

	it('renders safe DTO detail and opt-out instructions', () => {
		const body = buildIssueBody(report);
		expect(body).toContain('Automatic error report');
		expect(body).toContain('PLUGIN_REGISTER_TIMEOUT');
		expect(body).toContain('@mcp-vertex/error-reporting/src/index.ts:1:2');
		expect(body).not.toContain('Error: boom');
		expect(body).toContain('"enabled": false');
	});
});
