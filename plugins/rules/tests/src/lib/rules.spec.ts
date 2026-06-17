import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@cartago-git/mcp-core/public';

import { detectPresetForArea } from '@cartago-git/mcp-rules/lib/frameworks/detect-framework';
import { buildRulesManifest } from '@cartago-git/mcp-rules/lib/frameworks/manifest';
import { SUPPORTED_PRESET_IDS } from '@cartago-git/mcp-rules/lib/frameworks/presets';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: (dir) => {
		const prefix = `${dir}/`;
		const names = new Set<string>();
		for (const path of Object.keys(files)) {
			if (path.startsWith(prefix)) {
				const rest = path.slice(prefix.length).split('/')[0];
				if (rest) names.add(rest);
			}
		}
		return [...names];
	},
});

describe('detectPresetForArea', () => {
	it('detects angular, react+ts/js, and vanilla fallback', () => {
		expect(
			detectPresetForArea(
				reader({ 'package.json': JSON.stringify({ dependencies: { '@angular/core': '^21' } }) }),
				''
			).presetId
		).toBe('angular');
		expect(
			detectPresetForArea(
				reader({
					'package.json': JSON.stringify({ dependencies: { react: '^19' } }),
					'tsconfig.json': '{}',
				}),
				''
			).presetId
		).toBe('react-ts');
		expect(
			detectPresetForArea(
				reader({ 'package.json': JSON.stringify({ dependencies: { react: '^19' } }) }),
				''
			).presetId
		).toBe('react-js');
		expect(detectPresetForArea(reader({}), '').presetId).toBe('vanilla-js');
	});

	it('exposes the supported preset ids incl. the non-eslint laravel preset', () => {
		expect(SUPPORTED_PRESET_IDS).toContain('angular');
		expect(SUPPORTED_PRESET_IDS).toContain('vue');
		expect(SUPPORTED_PRESET_IDS).toContain('jquery');
		expect(SUPPORTED_PRESET_IDS).toContain('laravel');
	});

	it('detects a Laravel (PHP) area via composer.json', () => {
		expect(
			detectPresetForArea(
				reader({ 'composer.json': '{"require":{"laravel/framework":"^11"}}' }),
				''
			).presetId
		).toBe('laravel');
	});
});

describe('buildRulesManifest', () => {
	it('maps areas and puts the project config first, our default behind', () => {
		const manifest = buildRulesManifest({
			reader: reader({
				'package.json': JSON.stringify({ name: 'demo' }),
				'apps/web/package.json': JSON.stringify({ dependencies: { vue: '^3' } }),
				'apps/web/eslint.config.mjs': 'export default [];',
				'apps/api/package.json': JSON.stringify({ dependencies: { '@angular/core': '^21' } }),
				'apps/api/tsconfig.json': '{}',
			}),
			projectName: 'demo',
			cacheRelDir: '.cache/mcp-core/rules',
			mode: 'mixed',
		});
		const web = manifest.projects.demo?.['apps/web'];
		expect(web?.framework).toBe('vue');
		// project's own config first, ours behind
		expect(web?.eslint[0]).toBe('apps/web/eslint.config.mjs');
		expect(web?.eslint[1]).toBe('.cache/mcp-core/rules/vue.eslint.config.mjs');
		const api = manifest.projects.demo?.['apps/api'];
		expect(api?.framework).toBe('angular');
		expect(manifest.mode).toBe('mixed');
	});

	it('honours an area override', () => {
		const manifest = buildRulesManifest({
			reader: reader({ 'package.json': JSON.stringify({ name: 'demo' }) }),
			projectName: 'demo',
			cacheRelDir: '.cache/mcp-core/rules',
			mode: 'strict',
			overrides: { root: 'react-ts' },
		});
		expect(manifest.projects.demo?.root?.presetId).toBe('react-ts');
		expect(manifest.projects.demo?.root?.reason).toMatch(/forced/);
	});
});
