/**
 * f00051 S4 — per-preset check/fix/typecheck commands.
 *
 * Before S4, `check_rules` / `apply_rules` emitted ESLint-flavoured
 * commands for every non-PHP preset. This spec pins the per-language
 * commands: each new-language preset (Python, Go, Rust, Ruby, Java,
 * Kotlin, Swift, C#, Elixir) must emit its OWN tool — never `eslint`.
 * The JS/TS (`eslint`) and PHP (`pint`) presets stay byte-identical.
 */
import { describe, expect, it } from 'vitest';

import type {
	IFileReader,
	IWorkspacePathProvider,
} from '@mcp-vertex/core/public';

import {
	buildApplyRulesRegistration,
	buildCheckRulesRegistration,
} from '@mcp-vertex/rules/lib/tools/rules-tools';

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

const workspace: IWorkspacePathProvider = {
	root: '/ws',
	resolve: (p: string) => `/ws/${p}`,
};

type Handler = (a: unknown) => Promise<{
	content: Array<{ text: string }>;
	structuredContent?: Record<string, unknown>;
}>;

const invoke = async (
	reg: { register: (server: unknown) => Promise<void> | void },
	args: unknown,
): Promise<Record<string, unknown>> => {
	let handler: Handler | undefined;
	await reg.register({
		registerTool: (_name: string, _desc: unknown, fn: Handler): void => {
			handler = fn;
		},
	});
	if (!handler) throw new Error('tool did not register a handler');
	const result = await handler(args);
	return result.structuredContent as Record<string, unknown>;
};

const options = (files: Record<string, string>) => ({
	namespacePrefix: 'rules',
	workspace,
	reader: reader(files),
	projectName: 'demo',
	cacheRelDir: '.cache/mcp-vertex/rules',
	manifestRelPath: '.cache/mcp-vertex/rules/rules-map.json',
	mode: 'mixed' as const,
});

// language marker → { check, fix, typecheck } the preset must emit.
const CASES: ReadonlyArray<{
	readonly name: string;
	readonly files: Record<string, string>;
	readonly check: string;
	readonly fix: string;
	readonly typecheck?: string;
}> = [
	{
		name: 'Python (ruff)',
		files: { 'pyproject.toml': '[project]\nname = "api"\n' },
		check: 'ruff check .',
		fix: 'ruff check --fix .',
		typecheck: 'basedpyright .',
	},
	{
		name: 'Go (golangci-lint)',
		files: { 'go.mod': 'module demo\n\ngo 1.22\n' },
		check: 'golangci-lint run ./...',
		fix: 'golangci-lint run --fix ./...',
		typecheck: 'go vet ./...',
	},
	{
		name: 'Rust (clippy)',
		files: { 'Cargo.toml': '[package]\nname = "cli"\n' },
		check: 'cargo clippy --workspace --all-targets -- -D warnings',
		fix: 'cargo clippy --fix --workspace --all-targets',
		typecheck: 'cargo check --workspace',
	},
	{
		name: 'Ruby (rubocop)',
		files: { Gemfile: 'source "https://rubygems.org"\n' },
		check: 'rubocop .',
		fix: 'rubocop -a .',
	},
	{
		name: 'Java (checkstyle)',
		files: { 'pom.xml': '<project></project>\n' },
		check: './gradlew checkstyleMain',
		fix: './gradlew spotlessApply',
		typecheck: './gradlew compileJava',
	},
	{
		name: 'Kotlin (ktlint)',
		files: { 'build.gradle.kts': 'plugins {}\n' },
		check: 'ktlint',
		fix: 'ktlint -F',
		typecheck: './gradlew compileKotlin',
	},
	{
		name: 'Swift (swiftlint)',
		files: { 'Package.swift': '// swift-tools-version:5.9\n' },
		check: 'swiftlint lint',
		fix: 'swiftlint --fix',
		typecheck: 'swift build',
	},
	{
		name: 'C# (dotnet format)',
		files: { 'app.csproj': '<Project></Project>\n' },
		check: 'dotnet format --verify-no-changes',
		fix: 'dotnet format',
		typecheck: 'dotnet build -p:TreatWarningsAsErrors=true',
	},
	{
		name: 'Elixir (credo)',
		files: { 'mix.exs': 'defmodule Demo.MixProject do\nend\n' },
		check: 'mix credo --strict',
		fix: 'mix format',
		typecheck: 'mix dialyzer',
	},
];

describe('f00051 S4 — per-preset check/fix/typecheck commands', () => {
	for (const c of CASES) {
		it(`${c.name}: check_rules emits its own command, never eslint`, async () => {
			const reg = buildCheckRulesRegistration(options(c.files));
			const out = await invoke(reg, {});
			const checks = out.checks as Array<{
				area: string;
				command: string;
				typecheckCommand?: string;
			}>;
			const root = checks.find((x) => x.area === 'root');
			expect(root, `root area present for ${c.name}`).toBeDefined();
			expect(root?.command).toBe(c.check);
			expect(root?.command).not.toContain('eslint');
			if (c.typecheck !== undefined) {
				expect(root?.typecheckCommand).toBe(c.typecheck);
			} else {
				expect(root?.typecheckCommand).toBeUndefined();
			}
		});

		it(`${c.name}: apply_rules emits its own fix command, never eslint`, async () => {
			const reg = buildApplyRulesRegistration(options(c.files));
			const out = await invoke(reg, {});
			expect(out.command).toBe(c.check);
			expect(out.fixCommand).toBe(c.fix);
			expect(out.fixCommand as string).not.toContain('eslint');
		});
	}

	it('JS/TS (eslint) command stays byte-identical', async () => {
		const reg = buildCheckRulesRegistration(
			options({
				'package.json': JSON.stringify({
					dependencies: { react: '18', typescript: '5' },
					devDependencies: { '@types/react': '18' },
				}),
				'tsconfig.json': '{}',
			}),
		);
		const out = await invoke(reg, {});
		const checks = out.checks as Array<{ area: string; command: string }>;
		const root = checks.find((x) => x.area === 'root');
		expect(root?.command).toContain('eslint');
	});

	it('PHP (pint) command stays byte-identical', async () => {
		const reg = buildApplyRulesRegistration(
			options({
				'composer.json': JSON.stringify({
					require: { 'laravel/framework': '^11' },
				}),
				artisan: '#!/usr/bin/env php\n',
			}),
		);
		const out = await invoke(reg, {});
		expect(out.command).toBe('./vendor/bin/pint --test');
		expect(out.fixCommand).toBe('./vendor/bin/pint');
	});
});
