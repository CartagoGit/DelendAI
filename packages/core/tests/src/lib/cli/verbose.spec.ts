import { describe, expect, it } from 'vitest';

import {
	buildAssemblyDiagnostics,
	formatVerbose,
} from '@mcp-vertex/core/lib/cli/assemble';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import type { IPluginLoadResult } from '@mcp-vertex/core/lib/plugins/load-plugins';
import type { IMcpVertexHostConfig } from '@mcp-vertex/core/lib/contracts/interfaces/host-config.interface';

const args = parseCliArgs(
	['--plugins=demo,other', '--workspace=/ws', '--cacheDir=.c', '--docsDir=.d'],
	'/cwd'
);

const loadResult = {
	loaded: [
		{ plugin: { name: 'demo', version: '1.2.3' }, registrations: {} },
		{ plugin: { name: 'other', version: undefined }, registrations: {} },
	],
	errors: [{ specifier: 'broken', message: 'boom' }],
} as unknown as IPluginLoadResult;

const config = {
	metadata: { name: 's', version: '0' },
	namespacePrefix: 'mcpvertex',
	extraTools: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
	extraPrompts: [{ id: 'p' }],
	extraResources: [],
} as unknown as IMcpVertexHostConfig;

describe('--verbose diagnostics (N23)', () => {
	it('buildAssemblyDiagnostics snapshots plugins, counts and order', () => {
		const d = buildAssemblyDiagnostics(args, loadResult, config, [
			'mcpvertex_overview',
			'demo_x',
		]);
		expect(d.workspace).toBe('/ws');
		expect(d.cacheDir).toBe('.c');
		expect(d.plugins.requested).toEqual(['demo', 'other']);
		expect(d.plugins.loaded).toEqual([
			{ name: 'demo', version: '1.2.3' },
			{ name: 'other' },
		]);
		expect(d.plugins.errors).toEqual(['boom']);
		expect(d.counts).toEqual({ tools: 3, prompts: 1, resources: 0 });
		expect(d.registrationOrder).toEqual(['mcpvertex_overview', 'demo_x']);
	});

	it('formatVerbose renders stderr lines with version + counts + order', () => {
		const out = formatVerbose(
			buildAssemblyDiagnostics(args, loadResult, config, ['t1'])
		);
		expect(out).toContain('[mcp-vertex] verbose:');
		expect(out).toContain('loaded=[demo@1.2.3, other]');
		expect(out).toContain('errors=1');
		expect(out).toContain('tools=3 prompts=1 resources=0');
		expect(out).toContain('registrationOrder=[t1]');
		expect(out.endsWith('\n')).toBe(true);
	});
});
