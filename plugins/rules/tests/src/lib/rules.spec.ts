import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@mcp-vertex/core/public';

import { detectPresetForArea } from '@mcp-vertex/rules/lib/frameworks/detect-framework';
import { buildRulesManifest } from '@mcp-vertex/rules/lib/frameworks/manifest';
import { SUPPORTED_PRESET_IDS } from '@mcp-vertex/rules/lib/frameworks/presets';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async (dir) => {
		// Mirror the real workspace reader: `listDir('')`/`listDir('.')`
		// lists the immediate children of the workspace root.
		const prefix = dir === '' || dir === '.' ? '' : `${dir}/`;
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

describe('detectPresetForArea', async () => {
	it('detects angular, react+ts/js, and vanilla fallback', async () => {
		expect(
			(
				await detectPresetForArea(
					reader({
						'package.json': JSON.stringify({
							dependencies: { '@angular/core': '^21' },
						}),
					}),
					'',
				)
			).presetId,
		).toBe('angular');
		expect(
			(
				await detectPresetForArea(
					reader({
						'package.json': JSON.stringify({
							dependencies: { react: '^19' },
						}),
						'tsconfig.json': '{}',
					}),
					'',
				)
			).presetId,
		).toBe('react-ts');
		expect(
			(
				await detectPresetForArea(
					reader({
						'package.json': JSON.stringify({
							dependencies: { react: '^19' },
						}),
					}),
					'',
				)
			).presetId,
		).toBe('react-js');
		expect((await detectPresetForArea(reader({}), '')).presetId).toBe(
			'vanilla-js',
		);
	});

	it('exposes the supported preset ids incl. the non-eslint laravel preset', async () => {
		expect(SUPPORTED_PRESET_IDS).toContain('angular');
		expect(SUPPORTED_PRESET_IDS).toContain('vue');
		expect(SUPPORTED_PRESET_IDS).toContain('jquery');
		expect(SUPPORTED_PRESET_IDS).toContain('laravel');
	});

	it('detects a Laravel (PHP) area via composer.json', async () => {
		expect(
			(
				await detectPresetForArea(
					reader({
						'composer.json':
							'{"require":{"laravel/framework":"^11"}}',
					}),
					'',
				)
			).presetId,
		).toBe('laravel');
	});

	it('detects meta-frameworks BEFORE the generic react/vue checks (H6)', async () => {
		// Next ships react transitively → must win over the plain react-ts rule.
		expect(
			(
				await detectPresetForArea(
					reader({
						'package.json': JSON.stringify({
							dependencies: { next: '^15', react: '^19' },
						}),
						'tsconfig.json': '{}',
					}),
					'',
				)
			).presetId,
		).toBe('next-ts');
		// Next via config file, no dep.
		expect(
			(
				await detectPresetForArea(
					reader({ 'next.config.mjs': '', 'tsconfig.json': '{}' }),
					'',
				)
			).presetId,
		).toBe('next-ts');
		// Nuxt wins over vue.
		expect(
			(
				await detectPresetForArea(
					reader({
						'package.json': JSON.stringify({
							dependencies: { nuxt: '^3', vue: '^3' },
						}),
					}),
					'',
				)
			).presetId,
		).toBe('nuxt');
		// Astro / Remix / Solid.
		expect(
			(
				await detectPresetForArea(
					reader({ 'astro.config.ts': '', 'tsconfig.json': '{}' }),
					'',
				)
			).presetId,
		).toBe('astro');
		expect(
			(
				await detectPresetForArea(
					reader({
						'package.json': JSON.stringify({
							dependencies: { '@remix-run/react': '^2' },
						}),
						'tsconfig.json': '{}',
					}),
					'',
				)
			).presetId,
		).toBe('remix');
		expect(
			(
				await detectPresetForArea(
					reader({
						'package.json': JSON.stringify({
							dependencies: { 'solid-js': '^1' },
						}),
						'tsconfig.json': '{}',
					}),
					'',
				)
			).presetId,
		).toBe('solid-ts');
	});

	it('exposes the new meta-framework preset ids', async () => {
		for (const id of ['next-ts', 'remix', 'nuxt', 'astro', 'solid-ts']) {
			expect(SUPPORTED_PRESET_IDS).toContain(id);
		}
	});

	// --- f00051 S2: per-language manifest detection -----------------------
	it('detects each non-JS language via its exclusive manifest/lockfile', async () => {
		const cases: ReadonlyArray<readonly [Record<string, string>, string]> =
			[
				[
					{ 'pyproject.toml': '[project]\nname = "api"' },
					'python-ruff',
				],
				[
					{ 'go.mod': 'module example.com/svc\n\ngo 1.22' },
					'go-golangci',
				],
				[{ 'Cargo.toml': '[package]\nname = "cli"' }, 'rust-clippy'],
				[{ Gemfile: "source 'https://rubygems.org'" }, 'ruby-rubocop'],
				[{ 'pom.xml': '<project></project>' }, 'java-checkstyle'],
				[
					{ 'build.gradle.kts': 'plugins { kotlin("jvm") }' },
					'kotlin-ktlint',
				],
				[
					{ 'Package.swift': '// swift-tools-version:5.9' },
					'swift-swiftlint',
				],
				[{ 'Foo.csproj': '<Project></Project>' }, 'csharp-dotnet'],
				[
					{ 'mix.exs': 'defmodule App.MixProject do\nend' },
					'elixir-credo',
				],
			];
		for (const [files, expected] of cases) {
			expect(
				(await detectPresetForArea(reader(files), '')).presetId,
			).toBe(expected);
		}
	});

	// --- f00051 S3 batch: Dart / Scala / Haskell / Zig / C++ --------------
	it('detects the S3-batch languages via their manifests', async () => {
		const cases: ReadonlyArray<readonly [Record<string, string>, string]> =
			[
				[{ 'pubspec.yaml': 'name: app' }, 'dart-analyze'],
				[{ 'build.sbt': 'name := "app"' }, 'scala-scalafmt'],
				[{ 'stack.yaml': 'resolver: lts-22.0' }, 'haskell-hlint'],
				[{ 'app.cabal': 'name: app' }, 'haskell-hlint'],
				[{ 'build.zig': 'pub fn build() void {}' }, 'zig-fmt'],
				[{ 'CMakeLists.txt': 'project(app)' }, 'cpp-clang'],
			];
		for (const [files, expected] of cases) {
			expect(
				(await detectPresetForArea(reader(files), '')).presetId,
			).toBe(expected);
		}
	});

	it('per-language manifest wins over a co-located package.json (polyglot tie-break)', async () => {
		// A Python backend that also ships a package.json for its JS frontend
		// tooling must still resolve to Python (the exclusive manifest wins).
		expect(
			(
				await detectPresetForArea(
					reader({
						'pyproject.toml': '[project]\nname = "api"',
						'package.json': JSON.stringify({
							dependencies: { react: '^19' },
						}),
						'tsconfig.json': '{}',
					}),
					'',
				)
			).presetId,
		).toBe('python-ruff');
		// go.mod beats package.json too.
		expect(
			(
				await detectPresetForArea(
					reader({
						'go.mod': 'module x\n\ngo 1.22',
						'package.json': JSON.stringify({
							dependencies: { vue: '^3' },
						}),
					}),
					'',
				)
			).presetId,
		).toBe('go-golangci');
	});

	it('exposes the new per-language preset ids', async () => {
		for (const id of [
			'python-ruff',
			'go-golangci',
			'rust-clippy',
			'ruby-rubocop',
			'java-checkstyle',
			'kotlin-ktlint',
			'swift-swiftlint',
			'csharp-dotnet',
			'elixir-credo',
		]) {
			expect(SUPPORTED_PRESET_IDS).toContain(id);
		}
	});
});

describe('buildRulesManifest', async () => {
	it('maps areas and puts the project config first, our default behind', async () => {
		const manifest = await buildRulesManifest({
			reader: reader({
				'package.json': JSON.stringify({ name: 'demo' }),
				'apps/web/package.json': JSON.stringify({
					dependencies: { vue: '^3' },
				}),
				'apps/web/eslint.config.mjs': 'export default [];',
				'apps/api/package.json': JSON.stringify({
					dependencies: { '@angular/core': '^21' },
				}),
				'apps/api/tsconfig.json': '{}',
			}),
			projectName: 'demo',
			cacheRelDir: '.cache/mcp-vertex/rules',
			mode: 'mixed',
		});
		const web = (await manifest).projects.demo?.['apps/web'];
		expect(web?.framework).toBe('vue');
		// project's own config first, ours behind
		expect(web?.eslint[0]).toBe('apps/web/eslint.config.mjs');
		expect(web?.eslint[1]).toBe(
			'.cache/mcp-vertex/rules/vue.eslint.config.mjs',
		);
		const api = (await manifest).projects.demo?.['apps/api'];
		expect(api?.framework).toBe('angular');
		expect((await manifest).mode).toBe('mixed');
	});

	it('honours an area override', async () => {
		const manifest = await buildRulesManifest({
			reader: reader({
				'package.json': JSON.stringify({ name: 'demo' }),
			}),
			projectName: 'demo',
			cacheRelDir: '.cache/mcp-vertex/rules',
			mode: 'strict',
			overrides: { root: 'react-ts' },
		});
		expect((await manifest).projects.demo?.root?.presetId).toBe('react-ts');
		expect((await manifest).projects.demo?.root?.reason).toMatch(/forced/);
	});

	// f00051 S2 — a polyglot workspace classifies each area independently.
	it('classifies a polyglot workspace per-area without short-circuiting', async () => {
		const manifest = await buildRulesManifest({
			reader: reader({
				'package.json': JSON.stringify({ name: 'demo' }),
				'apps/web/package.json': JSON.stringify({
					dependencies: { next: '^15', react: '^19' },
				}),
				'apps/web/tsconfig.json': '{}',
				'apps/api/pyproject.toml': '[project]\nname = "api"',
				'services/rust-thing/Cargo.toml': '[package]\nname = "rt"',
				'services/go-thing/go.mod': 'module x\n\ngo 1.22',
			}),
			projectName: 'demo',
			cacheRelDir: '.cache/mcp-vertex/rules',
			mode: 'mixed',
		});
		const areas = (await manifest).projects.demo;
		expect(areas?.['apps/web']?.presetId).toBe('next-ts');
		expect(areas?.['apps/api']?.presetId).toBe('python-ruff');
		expect(areas?.['services/rust-thing']?.presetId).toBe('rust-clippy');
		expect(areas?.['services/go-thing']?.presetId).toBe('go-golangci');
	});
});
