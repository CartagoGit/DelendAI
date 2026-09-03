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
			{ id: 'go', score: 40, evidence: ['go.mod'] },
			{ id: 'rust', score: 30, evidence: ['Cargo.toml'] },
		]);
	});
});
