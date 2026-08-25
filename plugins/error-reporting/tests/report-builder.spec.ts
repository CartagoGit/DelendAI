import { describe, expect, it } from 'vitest';

import corePackageJson from '../../../packages/core/package.json';
import { MCP_VERTEX_VERSION } from '@mcp-vertex/core/version';

import {
	buildSafeReport,
	withSyntheticSafeStack,
} from '../src/lib/report-builder.helper';
import { McpVertexInternalError } from '../src/lib/mcp-internal-error.helper';

describe('buildSafeReport', () => {
	it('uses the published @mcp-vertex/core version as mcpVertexVersion', () => {
		const error = withSyntheticSafeStack(
			new McpVertexInternalError({
				code: 'PLUGIN_REGISTER_TIMEOUT',
				packageId: '@mcp-vertex/error-reporting',
				componentId: 'createSafeReporter',
			}),
			'@mcp-vertex/error-reporting',
			'createSafeReporter',
		);
		const report = buildSafeReport('quality_run_quality', error);
		expect(report).toBeDefined();
		expect(report?.mcpVertexVersion).toBe(MCP_VERTEX_VERSION);
		expect(report?.mcpVertexVersion).toBe(corePackageJson.version);
	});
});
