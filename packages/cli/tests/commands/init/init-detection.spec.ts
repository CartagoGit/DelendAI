/**
 * init-detection.spec.ts — f00088 S1.
 *
 * Exercises `detectTargetProject` and `withDetection` against an
 * in-memory `IFileReader` so every branch is deterministic and
 * platform-independent.
 */
import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@mcp-vertex/core/public';

import {
	detectTargetProject,
	fallbackDetection,
	summarizeDetection,
	withDetection,
} from '../../../src/commands/init/init-detection';
import { InitAnswers } from '../../../src/commands/init/init-answers.schema';

const textReader = (files: Readonly<Record<string, string>>): IFileReader => ({
	async readFile(rel) {
		return files[rel];
	},
	async exists(rel) {
		return rel in files;
	},
	async listDir(rel) {
		const prefix = rel === '' ? '' : `${rel}/`;
		const out: string[] = [];
		for (const key of Object.keys(files)) {
			if (!key.startsWith(prefix)) continue;
			const rest = key.slice(prefix.length);
			if (rest.length === 0) continue;
			const slash = rest.indexOf('/');
			if (slash === -1) out.push(rest);
			else if (!out.includes(rest.slice(0, slash)))
				out.push(rest.slice(0, slash));
		}
		return out;
	},
});

describe('detectTargetProject (f00088 S1)', () => {
	it('flags Angular + workspaces → pluginPathsRoot = libs (framework wins over monorepo)', async () => {
		const reader = textReader({
			'package.json': JSON.stringify({
				name: 'demo-angular',
				workspaces: ['packages/*'],
				dependencies: { '@angular/core': '^18.0.0' },
			}),
			'yarn.lock': '',
		});
		const detection = await detectTargetProject('/workspace', { reader });
		expect(detection.framework).toBe('angular');
		// The analyzer's `workspaces` signal collapses to
		// `bun/npm-workspaces` (it doesn't try to disambiguate which
		// package manager owns the `workspaces` field). The framework
		// match short-circuits before the monorepo mapping kicks in.
		expect(detection.pluginPathsRoot).toBe('libs');
		expect(detection.sourceRoot).toBe('libs');
	});

	it('flags bun/npm-workspaces → pluginPathsRoot = packages', async () => {
		const reader = textReader({
			'package.json': JSON.stringify({
				name: 'demo-bun-mono',
				workspaces: ['packages/*'],
			}),
			'bun.lockb': '',
		});
		const detection = await detectTargetProject('/workspace', { reader });
		expect(detection.monorepoTool).toBe('bun/npm-workspaces');
		expect(detection.pluginPathsRoot).toBe('packages');
		expect(detection.sourceRoot).toBe('packages');
	});

	it('flags single-package TypeScript → pluginPathsRoot = plugins, sourceRoot = src', async () => {
		const reader = textReader({
			'package.json': JSON.stringify({ name: 'demo-ts' }),
			'tsconfig.json': '{}',
		});
		const detection = await detectTargetProject('/workspace', { reader });
		expect(detection.language).toBe('typescript');
		expect(detection.pluginPathsRoot).toBe('plugins');
		expect(detection.sourceRoot).toBe('src');
	});

	it('honours explicitPluginPathsRoot override', async () => {
		const reader = textReader({
			'package.json': JSON.stringify({ name: 'demo' }),
			'tsconfig.json': '{}',
		});
		const detection = await detectTargetProject('/workspace', {
			reader,
			explicitPluginPathsRoot: 'custom/root',
		});
		expect(detection.pluginPathsRoot).toBe('custom/root');
	});

	it('flags existing MCP project when @modelcontextprotocol/sdk is in deps', async () => {
		const reader = textReader({
			'package.json': JSON.stringify({
				name: 'has-mcp',
				dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' },
			}),
		});
		const detection = await detectTargetProject('/workspace', { reader });
		expect(detection.hasMcpProject).toBe(true);
		expect(detection.mcpEvidence.length).toBeGreaterThan(0);
	});

	it('falls back to plugins/ for an empty workspace', async () => {
		const reader = textReader({});
		const detection = await detectTargetProject('/workspace', { reader });
		expect(detection.language).toBe('unknown');
		expect(detection.framework).toBeUndefined();
		expect(detection.pluginPathsRoot).toBe('plugins');
		expect(detection.hasMcpProject).toBe(false);
	});
});

describe('summarizeDetection (f00088 S1)', () => {
	it('joins language + framework + package manager + monorepo', () => {
		const summary = summarizeDetection(fallbackDetection());
		expect(typeof summary).toBe('string');
		expect(summary.length).toBeGreaterThan(0);
	});
});

describe('withDetection (f00088 S1)', () => {
	it('decorates an answers object with the detected shape', async () => {
		const reader = textReader({
			'package.json': JSON.stringify({
				name: 'demo',
				dependencies: { '@angular/core': '^18.0.0' },
				workspaces: ['packages/*'],
			}),
			'yarn.lock': '',
		});
		const base = InitAnswers.parse({
			preset: 'swarm',
			workspaceRoot: '/workspace',
		});
		const decorated = await withDetection(base, '/workspace', { reader });
		expect(decorated.detected).toBeDefined();
		expect(decorated.detected?.framework).toBe('angular');
	});
});
