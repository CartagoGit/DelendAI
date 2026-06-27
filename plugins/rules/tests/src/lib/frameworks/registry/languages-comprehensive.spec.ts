import { describe, expect, it } from 'vitest';
import { detectPresetForArea } from '@mcp-vertex/rules/lib/frameworks/detect-framework';
import { buildManifestViaComposition } from '@mcp-vertex/rules/lib/frameworks/manifest-via-composition';
import { buildDefaultComposition } from '@mcp-vertex/rules/lib/frameworks/registry/factory';
import { DEFAULT_DOGMA_ADAPTERS } from '@mcp-vertex/rules/lib/frameworks/dogmas';
import type { IFileReader } from '@mcp-vertex/core/public';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async (dir) => {
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

const LANGS: Array<{
	name: string;
	file: string;
	content: string;
	expectedPreset: string;
	dogmaKey: string;
}> = [
	{
		name: 'Rust',
		file: 'Cargo.toml',
		content: '[package]\nname = "rs"\n',
		expectedPreset: 'rust-clippy',
		dogmaKey: 'rs',
	},
	{
		name: 'Python',
		file: 'pyproject.toml',
		content: '[project]\nname = "py"\n',
		expectedPreset: 'python-ruff',
		dogmaKey: 'py',
	},
	{
		name: 'Go',
		file: 'go.mod',
		content: 'module go\n',
		expectedPreset: 'go-golangci',
		dogmaKey: 'go',
	},
	{
		name: 'Ruby',
		file: 'Gemfile',
		content: 'source "https://rubygems.org"\n',
		expectedPreset: 'ruby-rubocop',
		dogmaKey: 'rb',
	},
	{
		name: 'Elixir',
		file: 'mix.exs',
		content: 'defmodule MixProject do\n',
		expectedPreset: 'elixir-credo',
		dogmaKey: 'ex',
	},
	{
		name: 'Kotlin',
		file: 'build.gradle.kts',
		content: 'plugins {\n',
		expectedPreset: 'kotlin-ktlint',
		dogmaKey: 'kt',
	},
	{
		name: 'Java',
		file: 'pom.xml',
		content: '<project>\n',
		expectedPreset: 'java-checkstyle',
		dogmaKey: 'java',
	},
	{
		name: 'Swift',
		file: 'Package.swift',
		content: '// swift-tools-version:\n',
		expectedPreset: 'swift-swiftlint',
		dogmaKey: 'swift',
	},
	{
		name: 'C#',
		file: 'Foo.csproj',
		content: '<Project Sdk="Microsoft.NET.Sdk">\n',
		expectedPreset: 'csharp-dotnet',
		dogmaKey: 'cs',
	},
	{
		name: 'PHP/Laravel',
		file: 'composer.json',
		content: '{"require":{"laravel/framework":"^11"}}\n',
		expectedPreset: 'laravel',
		dogmaKey: 'php',
	},
	{
		name: 'Dart',
		file: 'pubspec.yaml',
		content: 'name: dart\n',
		expectedPreset: 'dart-analyze',
		dogmaKey: 'dart',
	},
	{
		name: 'Scala',
		file: 'build.sbt',
		content: 'lazy val root = project\n',
		expectedPreset: 'scala-scalafmt',
		dogmaKey: 'scala',
	},
	{
		name: 'Haskell',
		file: 'stack.yaml',
		content: 'resolver: lts-20\n',
		expectedPreset: 'haskell-hlint',
		dogmaKey: 'hs',
	},
	{
		name: 'Zig',
		file: 'build.zig',
		content: 'const std = @import("std");\n',
		expectedPreset: 'zig-fmt',
		dogmaKey: 'zig',
	},
	{
		name: 'C++',
		file: 'CMakeLists.txt',
		content: 'cmake_minimum_required(VERSION 3.10)\n',
		expectedPreset: 'cpp-clang',
		dogmaKey: 'cpp',
	},
	{
		name: 'TypeScript',
		file: 'tsconfig.json',
		content: '{}\n',
		expectedPreset: 'vanilla-ts',
		dogmaKey: 'ts',
	},
	{
		name: 'JavaScript',
		file: 'package.json',
		content: '{}\n',
		expectedPreset: 'vanilla-js',
		dogmaKey: 'js',
	},
];

describe('Comprehensive language detection, manifests, and dogmas', () => {
	for (const lang of LANGS) {
		it(`detects ${lang.name} preset correctly via detectPresetForArea`, async () => {
			const res = await detectPresetForArea(
				reader({
					[lang.file]: lang.content,
				}),
				'',
			);
			expect(res.presetId).toBe(lang.expectedPreset);
		});

		it(`resolves ${lang.name} preset correctly via the SOLID composition root`, async () => {
			const comp = buildDefaultComposition();
			const res = await comp.detector.detect(
				reader({
					[lang.file]: lang.content,
				}),
				'',
			);
			expect(res?.presetId).toBe(lang.expectedPreset);
		});

		it(`builds a valid manifest for ${lang.name} using buildManifestViaComposition`, async () => {
			const comp = buildDefaultComposition();
			const manifest = await buildManifestViaComposition(
				reader({
					'package.json': JSON.stringify({ name: 'demo' }),
					[`apps/app/${lang.file}`]: lang.content,
				}),
				'demo',
				'.cache/mcp-vertex/rules',
				'mixed',
				comp,
			);
			const area = manifest.projects.demo?.['apps/app'];
			expect(area?.presetId).toBe(lang.expectedPreset);
			expect(area?.eslint).toBeDefined();
			expect(area?.typecheck).toBeDefined();
		});
	}

	it('registers all 98 dogma adapters in the DogmaRegistry', () => {
		const registry = buildDefaultComposition().dogmas;
		expect(registry.supportedLanguages.length).toBeGreaterThanOrEqual(98);
	});

	for (const dogma of DEFAULT_DOGMA_ADAPTERS) {
		it(`dogma for ${dogma.language} is valid, structured, and carries bullets`, () => {
			expect(dogma.language).toBeDefined();
			expect(dogma.ownership).toBeDefined();
			expect(dogma.errorModel).toBeDefined();
			expect(dogma.nullSafety).toBeDefined();
			expect(dogma.naming).toBeDefined();
			expect(dogma.async).toBeDefined();
			expect(dogma.bullets.length).toBeGreaterThanOrEqual(3);
			for (const b of dogma.bullets) {
				expect(b.trim().length).toBeGreaterThan(0);
			}
		});
	}
});
