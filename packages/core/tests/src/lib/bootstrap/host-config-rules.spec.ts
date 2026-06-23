// host-config-rules.spec.ts: pin the SOLID host-config table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_HOST_CONFIG_RULES,
	matchHostConfig,
} from '@mcp-vertex/core/lib/bootstrap/host-config-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => [],
});

describe('DEFAULT_HOST_CONFIG_RULES (declarative table)', () => {
	it('declares the default `custom-extra-tools` rule', () => {
		expect(DEFAULT_HOST_CONFIG_RULES).toHaveLength(1);
		expect(DEFAULT_HOST_CONFIG_RULES[0]?.id).toBe('custom-extra-tools');
		expect(DEFAULT_HOST_CONFIG_RULES[0]?.evidence.kind).toBe('extra-tools');
	});
});

describe('matchHostConfig', () => {
	it('returns an empty list when no host-config.ts is present', () => {
		expect(matchHostConfig(reader({}))).toEqual([]);
	});
	it('returns an empty list when host-config.ts is the scaffold-only default', () => {
		const result = matchHostConfig(
			reader({
				'src/lib/shared/host-config.ts': `
export const buildHostConfig = (workspaceRoot: string): IMcpVertexHostConfig => ({
	extraTools: [
		buildScaffoldToolRegistration({...}),
	],
});
`,
			}),
		);
		expect(result).toEqual([]);
	});
	it('returns `custom-extra-tools` when the file declares additional tools', () => {
		const result = matchHostConfig(
			reader({
				'src/lib/shared/host-config.ts': `
export const buildHostConfig = (workspaceRoot: string): IMcpVertexHostConfig => ({
	extraTools: [
		buildScaffoldToolRegistration({...}),
		myCustomTool(),
	],
});
`,
			}),
		);
		expect(result).toEqual(['custom-extra-tools']);
	});
	it('reads the mcp-vertex monorepo layout first', () => {
		// Both layouts are present; the monorepo one wins.
		const result = matchHostConfig(
			reader({
				'libs/mcp-project/src/lib/shared/host-config.ts': `
export const buildHostConfig = () => ({
	extraTools: [buildScaffoldToolRegistration({...})],
});
`,
				'src/lib/shared/host-config.ts': `
export const buildHostConfig = () => ({
	extraTools: [buildScaffoldToolRegistration({...}), customTool()],
});
`,
			}),
		);
		// Monorepo file has only the scaffold helper → no hit.
		expect(result).toEqual([]);
	});
	it('falls back to the standalone layout when the monorepo file is missing', () => {
		const result = matchHostConfig(
			reader({
				'src/lib/shared/host-config.ts': `
export const buildHostConfig = () => ({
	extraTools: [buildScaffoldToolRegistration({...}), customTool()],
});
`,
			}),
		);
		expect(result).toEqual(['custom-extra-tools']);
	});
	it('strips `/* */` and `//` comments before matching', () => {
		const result = matchHostConfig(
			reader({
				'src/lib/shared/host-config.ts': `
export const buildHostConfig = () => ({
	extraTools: [
		// myCustomTool() — commented out, should not count
		buildScaffoldToolRegistration({...}),
		/* also() — also commented out */
	],
});
`,
			}),
		);
		expect(result).toEqual([]);
	});
});

describe('integration: detectCustomExtraTools uses the rule table', () => {
	it('analyzer sets `signals` to include the custom-tools marker', () => {
		const analysis = analyzeProject(
			reader({
				'src/lib/shared/host-config.ts': `
export const buildHostConfig = () => ({
	extraTools: [buildScaffoldToolRegistration({...}), customTool()],
});
`,
				'package.json': '{"name":"svc"}',
			}),
		);
		expect(analysis.signals).toContain('host-config has custom extraTools');
	});
});
