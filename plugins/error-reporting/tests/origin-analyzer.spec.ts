import { describe, expect, it } from 'vitest';

import { McpVertexInternalError } from '../src/lib/mcp-internal-error.helper';
import { analyzeErrorOrigin } from '../src/lib/origin-analyzer.helper';

describe('analyzeErrorOrigin', () => {
	it('classifies malformed LLM payload failures as llm-format', () => {
		const error = {
			error: {
				code: 'LLM_FORMAT',
				reason: 'provider rejected invalid request body after schema validation failed',
			},
		};

		expect(
			analyzeErrorOrigin({
				toolName: 'mcp-vertex_orchestrator-runner_invoke',
				error,
			}),
		).toEqual(
			expect.objectContaining({
				origin: 'llm-format',
			}),
		);
	});

	it('classifies external provider failures as provider', () => {
		expect(
			analyzeErrorOrigin({
				toolName: 'mcp-vertex_orchestrator-runner_invoke',
				error: new Error('api responded 429: rate limit exceeded'),
			}),
		).toEqual(
			expect.objectContaining({
				origin: 'provider',
			}),
		);
	});

	it('classifies first-party register and hook failures as internal', () => {
		expect(
			analyzeErrorOrigin({
				error: {
					pluginName: 'error-reporting',
					resolvedSpecifier: '@mcp-vertex/error-reporting',
					phase: 'register',
					error: new Error('register secret /home/private/repo'),
				},
			}),
		).toEqual(
			expect.objectContaining({
				origin: 'internal',
			}),
		);

		expect(
			analyzeErrorOrigin({
				error: {
					pluginName: 'error-reporting',
					resolvedSpecifier: '@mcp-vertex/error-reporting',
					hookName: 'onToolCall',
					toolName: 'mcp-vertex_quality_run_quality',
					args: { path: '/home/private/repo' },
					error: new Error('hook exploded'),
				},
			}),
		).toEqual(
			expect.objectContaining({
				origin: 'internal',
			}),
		);
	});

	it('classifies host project failures as project when there is no positive evidence', () => {
		expect(
			analyzeErrorOrigin({
				toolName: 'mcp-vertex_quality_run_quality',
				error: new Error(
					'eslint failed in /home/acme/project/src/index.ts',
				),
			}),
		).toEqual(
			expect.objectContaining({
				origin: 'project',
			}),
		);
	});

	it('classifies typed mcp-vertex failures as internal', () => {
		expect(
			analyzeErrorOrigin({
				toolName: 'mcp-vertex_quality_run_quality',
				error: new McpVertexInternalError({
					code: 'HOOK_FAILED',
					packageId: '@mcp-vertex/error-reporting',
					componentId: 'test',
				}),
			}),
		).toEqual(
			expect.objectContaining({
				origin: 'internal',
			}),
		);
	});
});
