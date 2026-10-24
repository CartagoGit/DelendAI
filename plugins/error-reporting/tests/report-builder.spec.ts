import { describe, expect, it } from 'vitest';

import corePackageJson from '../../../packages/core/package.json';
import type {
	IToolIdentityRegistry,
	IToolRegistryEntry,
} from '@delendai/core/public';
import { DELENDAI_VERSION } from '@delendai/core/version';

import {
	buildSafeReport,
	withSyntheticSafeStack,
} from '../src/lib/report-builder.helper';
import { DelendaiInternalError } from '../src/lib/mcp-internal-error.helper';

const registryOf = (
	entries: Record<string, IToolRegistryEntry>,
): IToolIdentityRegistry => ({
	get: (toolName) => entries[toolName],
	list: () => new Map(Object.entries(entries)),
});

describe('buildSafeReport', () => {
	it('uses the published @delendai/core version as delendaiVersion', () => {
		const error = withSyntheticSafeStack(
			new DelendaiInternalError({
				code: 'PLUGIN_REGISTER_TIMEOUT',
				packageId: '@delendai/error-reporting',
				componentId: 'createSafeReporter',
			}),
			'@delendai/error-reporting',
			'createSafeReporter',
		);
		const report = buildSafeReport({
			toolName: 'delendai_quality_run_quality',
			toolRegistry: registryOf({
				delendai_quality_run_quality: {
					packageName: '@delendai/quality',
					owner: 'delendai',
					publicToolName: 'run_quality',
					category: 'analysis',
				},
			}),
			error,
		});
		expect(report).toBeDefined();
		expect(report?.delendaiVersion).toBe(DELENDAI_VERSION);
		expect(report?.delendaiVersion).toBe(corePackageJson.version);
		expect(report?.safeToolId).toBe('@delendai/quality.run_quality');
		expect(report?.toolOwner).toBe('delendai');
	});

	it('omits safeToolId for host tools and keeps the report invariant across hosts', () => {
		const error = withSyntheticSafeStack(
			new DelendaiInternalError({
				code: 'PLUGIN_REGISTER_TIMEOUT',
				packageId: '@delendai/error-reporting',
				componentId: 'createSafeReporter',
			}),
			'@delendai/error-reporting',
			'createSafeReporter',
		);
		const bakeryReport = buildSafeReport({
			toolName: 'ovens.preheat',
			toolRegistry: registryOf({
				'ovens.preheat': {
					packageName: '/workspace/hosts/bakery.ts',
					owner: 'host-project',
					category: 'host-specific',
				},
			}),
			error,
		});
		const booksReport = buildSafeReport({
			toolName: 'isbn.lookup',
			toolRegistry: registryOf({
				'isbn.lookup': {
					packageName: '/workspace/hosts/books.ts',
					owner: 'host-project',
					category: 'host-specific',
				},
			}),
			error,
		});

		expect(bakeryReport?.safeToolId).toBeUndefined();
		expect(booksReport?.safeToolId).toBeUndefined();
		expect(bakeryReport?.toolOwner).toBe('host-project');
		expect(booksReport?.toolOwner).toBe('host-project');
		expect(bakeryReport).toEqual(booksReport);
	});

	it('does not trust a deceptive vertex-looking prefix without a first-party registry entry', () => {
		const error = withSyntheticSafeStack(
			new DelendaiInternalError({
				code: 'PLUGIN_REGISTER_TIMEOUT',
				packageId: '@delendai/error-reporting',
				componentId: 'createSafeReporter',
			}),
			'@delendai/error-reporting',
			'createSafeReporter',
		);
		const report = buildSafeReport({
			toolName: 'delendai.create_proposal',
			toolRegistry: registryOf({
				'delendai.create_proposal': {
					packageName: '/workspace/hosts/deceptive.ts',
					owner: 'host-project',
					category: 'host-specific',
				},
			}),
			error,
		});

		expect(report?.safeToolId).toBeUndefined();
		expect(JSON.stringify(report)).not.toContain(
			'delendai.create_proposal',
		);
	});
});
