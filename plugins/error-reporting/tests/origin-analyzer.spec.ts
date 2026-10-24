import { describe, expect, it } from 'vitest';

import type {
	IToolIdentityRegistry,
	IToolRegistryEntry,
} from '@delendai/core/public';

import { DelendaiInternalError } from '../src/lib/mcp-internal-error.helper';
import { analyzeErrorOrigin } from '../src/lib/origin-analyzer.helper';

const registryOf = (
	entries: Record<string, IToolRegistryEntry>,
): IToolIdentityRegistry => ({
	get: (toolName) => entries[toolName],
	list: () => new Map(Object.entries(entries)),
});

const emptyRegistry = registryOf({});

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
				toolName: 'delendai_orchestrator-runner_invoke',
				toolRegistry: registryOf({
					'delendai_orchestrator-runner_invoke': {
						packageName: '@delendai/orchestrator-runner',
						owner: 'delendai',
						publicToolName: 'invoke',
						category: 'orchestration',
					},
				}),
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
				toolName: 'delendai_orchestrator-runner_invoke',
				toolRegistry: emptyRegistry,
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
				toolRegistry: emptyRegistry,
				error: {
					pluginName: 'error-reporting',
					resolvedSpecifier: '@delendai/error-reporting',
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
				toolRegistry: emptyRegistry,
				error: {
					pluginName: 'error-reporting',
					resolvedSpecifier: '@delendai/error-reporting',
					hookName: 'onToolCall',
					toolName: 'delendai_quality_run_quality',
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
				toolName: 'delendai_quality_run_quality',
				toolRegistry: emptyRegistry,
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

	it('classifies typed delendai failures as internal', () => {
		expect(
			analyzeErrorOrigin({
				toolName: 'delendai_quality_run_quality',
				toolRegistry: emptyRegistry,
				error: new DelendaiInternalError({
					code: 'HOOK_FAILED',
					packageId: '@delendai/error-reporting',
					componentId: 'test',
				}),
			}),
		).toEqual(
			expect.objectContaining({
				origin: 'internal',
			}),
		);
	});

	it('does not trust a host tool that spoofs an internal llm suffix', () => {
		const origin = analyzeErrorOrigin({
			toolName: 'acme_private_billing_orchestrator-runner_invoke',
			toolRegistry: registryOf({
				'acme_private_billing_orchestrator-runner_invoke': {
					packageName: '/workspace/acme/tools.ts',
					owner: 'host-project',
					category: 'host-specific',
				},
			}),
			error: {
				error: {
					code: 'LLM_FORMAT',
					reason: 'provider rejected invalid request body after schema validation failed',
				},
			},
		});

		expect(origin.origin).not.toBe('llm-format');
	});
});
