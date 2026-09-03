import { describe, expect, it } from 'vitest';

import { detectLanguageSignalDetails } from '@mcp-vertex/core/lib/config/detect-stack-defaults.helper';
import { detectStack } from '@mcp-vertex/core/lib/config/detect-stack';
import { matchLanguageSignals } from '@mcp-vertex/core/lib/bootstrap/language-rules';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IStackProbeDeps } from '@mcp-vertex/core/lib/contracts/interfaces/stack-detection.interface';

const probe = (over: {
	pkg?: unknown | null;
	pyproject?: string | null;
	cargo?: string | null;
	gomod?: string | null;
	files?: readonly string[];
}): IStackProbeDeps => {
	const files = over.files ?? [];
	return {
		readJson: async (path) =>
			path.endsWith('package.json') ? (over.pkg ?? null) : null,
		readText: async (path) => {
			if (path.endsWith('pyproject.toml')) return over.pyproject ?? null;
			if (path.endsWith('Cargo.toml')) return over.cargo ?? null;
			if (path.endsWith('go.mod')) return over.gomod ?? null;
			return null;
		},
		listFiles: () => files,
	};
};

const reader = (files: readonly string[]): IFileReader => ({
	readFile: async () => undefined,
	exists: async (path) => files.includes(path),
	listDir: async () => [],
});

describe('detectStack language detection', () => {
	it('keeps TypeScript, Rust and Go in a polyglot workspace', async () => {
		const result = await detectStack(
			'/workspace',
			probe({
				pkg: { dependencies: { typescript: '^5.0.0' } },
				files: ['tsconfig.json', 'Cargo.toml', 'go.mod'],
				cargo: '[package]\nname = "worker"',
				gomod: 'module example.test/worker',
			}),
		);

		expect(result.detectedLanguages).toEqual(['go', 'rust', 'typescript']);
		expect(result.defaults.language).toBe('typescript');

		const signals = detectLanguageSignalDetails(
			{ typescript: '^5.0.0' },
			['tsconfig.json', 'Cargo.toml', 'go.mod'],
			'',
			'[package]',
			'module example.test/worker',
		);
		expect(signals).toEqual([
			{
				language: 'typescript',
				evidence: 'tsconfig.json',
				score: 100,
			},
			{ language: 'go', evidence: 'go.mod', score: 40 },
			{ language: 'rust', evidence: 'Cargo.toml', score: 30 },
		]);
	});

	it('does not let package.json hide Python without tsconfig', async () => {
		const result = await detectStack(
			'/workspace',
			probe({
				pkg: { dependencies: { 'frontend-helper': '^1.0.0' } },
				pyproject: '[project]\nname = "api"',
				files: ['pyproject.toml'],
			}),
		);

		expect(result.detectedLanguages).toEqual(['python']);
		expect(result.defaults.language).toBe('python');
	});

	it('keeps evidence for every language matched by the bootstrap rules', async () => {
		const matches = await matchLanguageSignals(
			reader(['tsconfig.json', 'Cargo.toml', 'go.mod']),
		);

		expect(matches).toEqual([
			{ id: 'typescript', score: 100, evidence: ['tsconfig.json'] },
			{ id: 'go', score: 90, evidence: ['go.mod'] },
			{ id: 'rust', score: 90, evidence: ['Cargo.toml'] },
		]);
	});

	it('reports JavaScript alongside Python instead of deleting it', async () => {
		// The mirror image of the bug this plan was written for. The first
		// fix suppressed `javascript` whenever ANY other language matched,
		// which answered "python" alone for a React frontend beside a
		// FastAPI backend — the same information loss, pointed the other
		// way. Rust, Go and Python are separate ecosystems and do not get
		// to delete a real signal.
		const matches = await matchLanguageSignals(reader(['pyproject.toml']), {
			dependencies: { react: '^18' },
		});

		expect(matches.map((match) => match.id)).toEqual([
			'python',
			'javascript',
		]);
		// Primary follows evidence strength, not array order: a manifest
		// that exists to declare one language outranks a `package.json`
		// that every Node repository has whatever it is written in.
		expect(matches[0]?.evidence).toEqual(['pyproject.toml']);
	});

	it('lets TypeScript, and only TypeScript, absorb JavaScript', async () => {
		// These two read the same evidence: a TypeScript project ships a
		// package.json too, so naming both is two names for one fact.
		const matches = await matchLanguageSignals(reader(['tsconfig.json']), {
			dependencies: {},
		});

		expect(matches.map((match) => match.id)).toEqual(['typescript']);
	});
});
