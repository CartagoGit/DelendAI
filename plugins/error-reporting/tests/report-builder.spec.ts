import { describe, expect, it } from 'vitest';

import corePackageJson from '../../../packages/core/package.json';
import type {
	IToolIdentityRegistry,
	IToolRegistryEntry,
} from '@delendai/core/public';
import { MCP_VERTEX_VERSION } from '@delendai/core/version';

import {
	buildSafeReport,
	withSyntheticSafeStack,
} from '../src/lib/report-builder.helper';
import { McpVertexInternalError } from '../src/lib/mcp-internal-error.helper';

const registryOf = (
	entries: Record<string, IToolRegistryEntry>,
): IToolIdentityRegistry => ({
	get: (toolName) => entries[toolName],
	list: () => new Map(Object.entries(entries)),
});

describe('buildSafeReport', () => {
	it('uses the published @delendai/core version as mcpVertexVersion', () => {
		const error = withSyntheticSafeStack(
			new McpVertexInternalError({
				code: 'PLUGIN_REGISTER_TIMEOUT',
				packageId: '@delendai/error-reporting',
				componentId: 'createSafeReporter',
			}),
			'@delendai/error-reporting',
			'createSafeReporter',
		);
		const report = buildSafeReport({
			toolName: 'mcp-vertex_quality_run_quality',
			toolRegistry: registryOf({
				'mcp-vertex_quality_run_quality': {
					packageName: '@delendai/quality',
					owner: 'mcp-vertex',
					publicToolName: 'run_quality',
					category: 'analysis',
				},
			}),
			error,
		});
		expect(report).toBeDefined();
		expect(report?.mcpVertexVersion).toBe(MCP_VERTEX_VERSION);
		expect(report?.mcpVertexVersion).toBe(corePackageJson.version);
		expect(report?.safeToolId).toBe('@delendai/quality.run_quality');
		expect(report?.toolOwner).toBe('mcp-vertex');
	});

	it('omits safeToolId for host tools and keeps the report invariant across hosts', () => {
		const error = withSyntheticSafeStack(
			new McpVertexInternalError({
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
			new McpVertexInternalError({
				code: 'PLUGIN_REGISTER_TIMEOUT',
				packageId: '@delendai/error-reporting',
				componentId: 'createSafeReporter',
			}),
			'@delendai/error-reporting',
			'createSafeReporter',
		);
		const report = buildSafeReport({
			toolName: 'mcp-vertex.create_proposal',
			toolRegistry: registryOf({
				'mcp-vertex.create_proposal': {
					packageName: '/workspace/hosts/deceptive.ts',
					owner: 'host-project',
					category: 'host-specific',
				},
			}),
			error,
		});

		expect(report?.safeToolId).toBeUndefined();
		expect(JSON.stringify(report)).not.toContain(
			'mcp-vertex.create_proposal',
		);
	});
});
