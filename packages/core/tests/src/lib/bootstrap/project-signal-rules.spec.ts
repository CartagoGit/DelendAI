// project-signal-rules.spec.ts: pin the SOLID project-signal-config table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@delendai/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@delendai/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_VERTEX_CONFIG_RULES,
	matchProjectSignalConfig,
	matchProjectSignalConfigFromRaw,
} from '@delendai/core/lib/bootstrap/project-signal-rules';

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

describe('matchProjectSignalConfig', async () => {
	it('returns an empty list when parsed is null', async () => {
		expect(matchProjectSignalConfig(null)).toEqual([]);
	});
	it('returns an empty list when neither plugins nor validationMatrix is present', async () => {
		expect(matchProjectSignalConfig({})).toEqual([]);
	});
	it('detects `plugins` when the plugins object is non-empty', async () => {
		expect(matchProjectSignalConfig({ plugins: { foo: {} } })).toEqual([
			'plugins',
		]);
	});
	it('does NOT detect `plugins` when the plugins object is empty', async () => {
		expect(matchProjectSignalConfig({ plugins: {} })).toEqual([]);
	});
	it('does NOT detect `plugins` when the value is an array (not an object)', async () => {
		expect(matchProjectSignalConfig({ plugins: [] })).toEqual([]);
	});
	it('detects `validation-matrix-scopes` when scopes is non-empty', async () => {
		expect(
			matchProjectSignalConfig({
				validationMatrix: {
					scopes: { full: [{ command: 'x', expect: 'exit0' }] },
				},
			}),
		).toEqual(['validation-matrix-scopes']);
	});
	it('does NOT detect `validation-matrix-scopes` when scopes is missing', async () => {
		expect(matchProjectSignalConfig({ validationMatrix: {} })).toEqual([]);
	});
	it('detects both when both are non-empty', async () => {
		expect(
			matchProjectSignalConfig({
				plugins: { p: {} },
				validationMatrix: { scopes: { full: [] } },
			}),
		).toEqual(['plugins', 'validation-matrix-scopes']);
	});
});

describe('matchProjectSignalConfigFromRaw (parse + match)', async () => {
	it('returns an empty list when the file is undefined', async () => {
		expect(matchProjectSignalConfigFromRaw(undefined)).toEqual([]);
	});
	it('returns an empty list on JSON parse error', async () => {
		expect(matchProjectSignalConfigFromRaw('{ not valid json')).toEqual([]);
	});
	it('returns an empty list when the file is an array, not an object', async () => {
		expect(matchProjectSignalConfigFromRaw('[]')).toEqual([]);
	});
	it('detects `plugins` from a well-formed file', async () => {
		expect(
			matchProjectSignalConfigFromRaw(
				JSON.stringify({ plugins: { quality: {} } }),
			),
		).toEqual(['plugins']);
	});
});

describe('integration: detectCustomProjectSignalConfig uses the rule table', async () => {
	it('analyzer sets the corresponding signal when plugins is non-empty', async () => {
		const analysis = await analyzeProject(
			reader({
				'delendai.config.json': JSON.stringify({
					plugins: { quality: {} },
				}),
				'package.json': '{"name":"svc"}',
			}),
		);
		expect(analysis.signals).toContain(
			'delendai.config.json has plugin or validation config',
		);
	});
	it('analyzer does NOT set the signal when plugins is empty', async () => {
		const analysis = await analyzeProject(
			reader({
				'delendai.config.json': JSON.stringify({
					plugins: {},
				}),
				'package.json': '{"name":"svc"}',
			}),
		);
		expect(analysis.signals).not.toContain(
			'delendai.config.json has plugin or validation config',
		);
	});
});
