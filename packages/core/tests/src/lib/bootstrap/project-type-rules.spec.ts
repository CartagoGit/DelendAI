// project-type-rules.spec.ts: pin the SOLID rule table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_PROJECT_TYPE_RULES,
	matchProjectType,
} from '@mcp-vertex/core/lib/bootstrap/project-type-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => [],
});

describe('DEFAULT_PROJECT_TYPE_RULES (declarative table)', () => {
	it('lists the expected project types in order of priority', () => {
		const results = DEFAULT_PROJECT_TYPE_RULES.map((r) => r.result);
		// First entries: highest-priority (monorepo > game > webapp > cli/library).
		expect(results[0]).toBe('monorepo');
		expect(results[1]).toBe('game');
		expect(results[2]).toBe('webapp');
	});
	it('monorepo outranks framework (a web framework inside a monorepo is still a monorepo)', () => {
		expect(
			matchProjectType({
				reader: reader({}),
				hasBin: false,
				hasExports: false,
				hasMain: false,
				framework: 'react',
				monorepoTool: 'nx',
				isGame: false,
			}),
		).toBe('monorepo');
	});
});

describe('matchProjectType', () => {
	it('returns `webapp` when the project has a framework', () => {
		expect(
			matchProjectType({
				reader: reader({}),
				hasBin: false,
				hasExports: false,
				hasMain: false,
				framework: 'react',
				monorepoTool: undefined,
				isGame: false,
			}),
		).toBe('webapp');
	});
	it('returns `cli` when the project has a `bin`', () => {
		expect(
			matchProjectType({
				reader: reader({}),
				hasBin: true,
				hasExports: false,
				hasMain: false,
				framework: undefined,
				monorepoTool: undefined,
				isGame: false,
			}),
		).toBe('cli');
	});
	it('returns `game` for a project whose deps include a game engine', () => {
		expect(
			matchProjectType({
				reader: reader({}),
				hasBin: false,
				hasExports: false,
				hasMain: false,
				framework: undefined,
				monorepoTool: undefined,
				isGame: true,
			}),
		).toBe('game');
	});
	it('returns `library` for a Rust library (Cargo.toml + no main.rs)', () => {
		expect(
			matchProjectType({
				reader: reader({ 'Cargo.toml': '...' }),
				hasBin: false,
				hasExports: false,
				hasMain: false,
				framework: undefined,
				monorepoTool: undefined,
				isGame: false,
			}),
		).toBe('library');
	});
	it('returns `cli` for a Rust binary (Cargo.toml + main.rs)', () => {
		expect(
			matchProjectType({
				reader: reader({
					'Cargo.toml': '...',
					'src/main.rs': 'fn main() {}',
				}),
				hasBin: false,
				hasExports: false,
				hasMain: false,
				framework: undefined,
				monorepoTool: undefined,
				isGame: false,
			}),
		).toBe('cli');
	});
	it('returns `generic` when no rule applies', () => {
		expect(
			matchProjectType({
				reader: reader({}),
				hasBin: false,
				hasExports: false,
				hasMain: false,
				framework: undefined,
				monorepoTool: undefined,
				isGame: false,
			}),
		).toBe('generic');
	});
	it('a custom rule table overrides the default (host can reprioritise)', () => {
		// Custom rule: `webapp` outranks `monorepo`. We pass an empty
		// list, then assert that we get the fallback.
		const customRules = [
			{
				result: 'webapp' as const,
				priority: 1000,
				matches: () => true,
			},
		];
		expect(
			matchProjectType(
				{
					reader: reader({}),
					hasBin: false,
					hasExports: false,
					hasMain: false,
					framework: undefined,
					monorepoTool: 'nx',
					isGame: false,
				},
				customRules,
			),
		).toBe('webapp');
	});
});

describe('integration: detectProjectType uses the rule table', () => {
	it('still classifies a TypeScript webapp project correctly', () => {
		const analysis = analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: '@acme/site',
					dependencies: { react: '^18' },
				}),
				'tsconfig.json': '{}',
			}),
		);
		expect(analysis.projectType).toBe('webapp');
	});
	it('still classifies a monorepo correctly', () => {
		const analysis = analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'big',
					workspaces: ['packages/*'],
				}),
				'nx.json': '{}',
			}),
		);
		expect(analysis.projectType).toBe('monorepo');
	});
});
