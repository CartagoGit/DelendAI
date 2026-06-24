// vertex-config-rules.spec.ts: pin the SOLID vertex-config table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_VERTEX_CONFIG_RULES,
	matchVertexConfig,
	matchVertexConfigFromRaw,
} from '@mcp-vertex/core/lib/bootstrap/vertex-config-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async () => [],
});

describe('DEFAULT_VERTEX_CONFIG_RULES (declarative table)', async () => {
	it('lists the two built-in rules (plugins, validation-matrix-scopes)', async () => {
		const ids = DEFAULT_VERTEX_CONFIG_RULES.map((r) => r.id);
		expect(ids).toEqual(['plugins', 'validation-matrix-scopes']);
	});
	it('plugins outranks validation-matrix-scopes', async () => {
		const plugins = DEFAULT_VERTEX_CONFIG_RULES.find(
			(r) => r.id === 'plugins',
		);
		const scopes = DEFAULT_VERTEX_CONFIG_RULES.find(
			(r) => r.id === 'validation-matrix-scopes',
		);
		expect(plugins?.priority).toBeGreaterThan(scopes?.priority ?? 0);
	});
});

describe('matchVertexConfig', async () => {
	it('returns an empty list when parsed is null', async () => {
		expect(matchVertexConfig(null)).toEqual([]);
	});
	it('returns an empty list when neither plugins nor validationMatrix is present', async () => {
		expect(matchVertexConfig({})).toEqual([]);
	});
	it('detects `plugins` when the plugins object is non-empty', async () => {
		expect(matchVertexConfig({ plugins: { foo: {} } })).toEqual([
			'plugins',
		]);
	});
	it('does NOT detect `plugins` when the plugins object is empty', async () => {
		expect(matchVertexConfig({ plugins: {} })).toEqual([]);
	});
	it('does NOT detect `plugins` when the value is an array (not an object)', async () => {
		expect(matchVertexConfig({ plugins: [] })).toEqual([]);
	});
	it('detects `validation-matrix-scopes` when scopes is non-empty', async () => {
		expect(
			matchVertexConfig({
				validationMatrix: {
					scopes: { full: [{ command: 'x', expect: 'exit0' }] },
				},
			}),
		).toEqual(['validation-matrix-scopes']);
	});
	it('does NOT detect `validation-matrix-scopes` when scopes is missing', async () => {
		expect(matchVertexConfig({ validationMatrix: {} })).toEqual([]);
	});
	it('detects both when both are non-empty', async () => {
		expect(
			matchVertexConfig({
				plugins: { p: {} },
				validationMatrix: { scopes: { full: [] } },
			}),
		).toEqual(['plugins', 'validation-matrix-scopes']);
	});
});

describe('matchVertexConfigFromRaw (parse + match)', async () => {
	it('returns an empty list when the file is undefined', async () => {
		expect(matchVertexConfigFromRaw(undefined)).toEqual([]);
	});
	it('returns an empty list on JSON parse error', async () => {
		expect(matchVertexConfigFromRaw('{ not valid json')).toEqual([]);
	});
	it('returns an empty list when the file is an array, not an object', async () => {
		expect(matchVertexConfigFromRaw('[]')).toEqual([]);
	});
	it('detects `plugins` from a well-formed file', async () => {
		expect(
			matchVertexConfigFromRaw(
				JSON.stringify({ plugins: { quality: {} } }),
			),
		).toEqual(['plugins']);
	});
});

describe('integration: detectCustomVertexConfig uses the rule table', async () => {
	it('analyzer sets the corresponding signal when plugins is non-empty', async () => {
		const analysis = await analyzeProject(
			reader({
				'mcp-vertex.config.json': JSON.stringify({
					plugins: { quality: {} },
				}),
				'package.json': '{"name":"svc"}',
			}),
		);
		expect(analysis.signals).toContain(
			'mcp-vertex.config.json has plugin or validation config',
		);
	});
	it('analyzer does NOT set the signal when plugins is empty', async () => {
		const analysis = await analyzeProject(
			reader({
				'mcp-vertex.config.json': JSON.stringify({
					plugins: {},
				}),
				'package.json': '{"name":"svc"}',
			}),
		);
		expect(analysis.signals).not.toContain(
			'mcp-vertex.config.json has plugin or validation config',
		);
	});
});
