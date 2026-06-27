import { describe, expect, it } from 'vitest';
import { readFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
	IFileReader,
	IWorkspacePathProvider,
} from '@mcp-vertex/core/public';
import {
	buildCheckRulesRegistration,
	buildGetRulesRegistration,
} from '@mcp-vertex/rules/lib/tools/rules-tools';

const rootPath = join(__dirname, '../../fixtures/polyglot');

const realReader: IFileReader = {
	readFile: async (p) => {
		try {
			return await readFile(join(rootPath, p), 'utf8');
		} catch {
			return undefined;
		}
	},
	exists: async (p) => {
		try {
			await stat(join(rootPath, p));
			return true;
		} catch {
			return false;
		}
	},
	listDir: async (dir) => {
		try {
			const entries = await readdir(join(rootPath, dir));
			return entries;
		} catch {
			return [];
		}
	},
};

const workspace: IWorkspacePathProvider = {
	root: rootPath,
	resolve: (p: string) => join(rootPath, p),
};

type Handler = (a: any) => Promise<{
	content: Array<{ text: string }>;
	structuredContent?: Record<string, any>;
}>;

const invoke = async (
	reg: { register: (server: any) => Promise<void> | void },
	args: any,
): Promise<any> => {
	let handler: Handler | undefined;
	await reg.register({
		registerTool: (_name: string, _desc: any, fn: Handler): void => {
			handler = fn;
		},
	} as any);
	if (!handler) throw new Error('tool did not register a handler');
	const result = await handler(args);
	return result.structuredContent;
};

const options = {
	namespacePrefix: 'rules',
	workspace,
	reader: realReader,
	projectName: 'polyglot',
	cacheRelDir: '.cache/mcp-vertex/rules',
	manifestRelPath: '.cache/mcp-vertex/rules/rules-map.json',
	mode: 'mixed' as const,
};

describe('Polyglot E2E rules check', () => {
	it('resolves all areas in the polyglot fixture correctly', async () => {
		const getRulesReg = buildGetRulesRegistration(options);
		const checkRulesReg = buildCheckRulesRegistration(options);

		const getRulesOut = await invoke(getRulesReg, {});
		expect(getRulesOut.mode).toBe('mixed');

		const areas = getRulesOut.areas;
		expect(areas).toBeDefined();

		const expected: Record<string, { presetId: string; linter: string }> = {
			'py-thing': { presetId: 'python-ruff', linter: 'ruff' },
			'go-thing': { presetId: 'go-golangci', linter: 'golangci-lint' },
			'rs-thing': { presetId: 'rust-clippy', linter: 'clippy' },
			'rb-thing': { presetId: 'ruby-rubocop', linter: 'rubocop' },
			'java-thing': { presetId: 'java-checkstyle', linter: 'checkstyle' },
			'kt-thing': { presetId: 'kotlin-ktlint', linter: 'ktlint' },
			'scala-thing': { presetId: 'scala-scalafmt', linter: 'scalafmt' },
			'cs-thing': { presetId: 'csharp-dotnet', linter: 'dotnet-format' },
			'zig-thing': { presetId: 'zig-fmt', linter: 'zig-fmt' },
			'swift-thing': { presetId: 'swift-swiftlint', linter: 'swiftlint' },
			'dart-thing': { presetId: 'dart-analyze', linter: 'dart-analyze' },
			'hs-thing': { presetId: 'haskell-hlint', linter: 'hlint' },
			'ex-thing': { presetId: 'elixir-credo', linter: 'credo' },
			web: { presetId: 'next-ts', linter: 'eslint' },
			'py-thing-with-bash': { presetId: 'python-ruff', linter: 'ruff' },
		};

		for (const [dir, exp] of Object.entries(expected)) {
			const area = areas.find((a: any) => a.area === dir);
			expect(area).toBeDefined();
			expect(area.rules.presetId).toBe(exp.presetId);
			expect(area.rules.linterConfigs).toBeDefined();
			expect(area.rules.linterConfigs.length).toBeGreaterThan(0);
		}

		const checkRulesOut = await invoke(checkRulesReg, {});
		expect(checkRulesOut.checks).toBeDefined();
		for (const [dir, exp] of Object.entries(expected)) {
			const check = checkRulesOut.checks.find((c: any) => c.area === dir);
			expect(check).toBeDefined();
			expect(check.command).toBeDefined();
			expect(check.command.length).toBeGreaterThan(0);
			if (exp.presetId !== 'laravel') {
				expect(check.command).toContain(exp.linter);
			}
		}

		const dogmas = getRulesOut.dogmas;
		expect(dogmas).toBeDefined();

		const rsDogma = dogmas['rs-thing'];
		expect(rsDogma).toBeDefined();
		expect(rsDogma.ownership).toBe('borrow-checker');
		expect(rsDogma.errorModel).toBe('Result');
		expect(rsDogma.naming).toBe('snake_case');
		expect(rsDogma.bullets.length).toBeGreaterThanOrEqual(3);

		const pyDogma = dogmas['py-thing'];
		expect(pyDogma).toBeDefined();
		expect(pyDogma.ownership).toBe('garbage-collected');
		expect(pyDogma.errorModel).toBe('exceptions');
		expect(pyDogma.naming).toBe('snake_case');
		expect(pyDogma.bullets.length).toBeGreaterThanOrEqual(3);
	});
});
