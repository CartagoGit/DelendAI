// language-rules.spec.ts: pin the SOLID language detection table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_LANGUAGE_RULES,
	matchLanguage,
} from '@mcp-vertex/core/lib/bootstrap/language-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => [],
});

describe('DEFAULT_LANGUAGE_RULES (declarative table)', () => {
	it('lists the five built-in languages', () => {
		const ids = DEFAULT_LANGUAGE_RULES.map((r) => r.id);
		expect(ids).toEqual([
			'typescript',
			'javascript',
			'python',
			'go',
			'rust',
		]);
	});
	it('typescript outranks python (a ts project may have a stray pyproject.toml)', () => {
		const ts = DEFAULT_LANGUAGE_RULES.find((r) => r.id === 'typescript');
		const py = DEFAULT_LANGUAGE_RULES.find((r) => r.id === 'python');
		expect(ts?.priority).toBeGreaterThan(py?.priority ?? 0);
	});
});

describe('matchLanguage', () => {
	it('returns `typescript` when tsconfig.json is present', () => {
		expect(matchLanguage(reader({ 'tsconfig.json': '{}' }))).toBe(
			'typescript',
		);
	});
	it('returns `typescript` when tsconfig.base.json is present (monorepo base)', () => {
		expect(matchLanguage(reader({ 'tsconfig.base.json': '{}' }))).toBe(
			'typescript',
		);
	});
	it('returns `javascript` when only package.json is present', () => {
		expect(matchLanguage(reader({ 'package.json': '{"name":"x"}' }))).toBe(
			'javascript',
		);
	});
	it('returns `python` for a pyproject.toml project', () => {
		expect(matchLanguage(reader({ 'pyproject.toml': '[project]' }))).toBe(
			'python',
		);
	});
	it('returns `python` for a requirements.txt project', () => {
		expect(matchLanguage(reader({ 'requirements.txt': 'flask' }))).toBe(
			'python',
		);
	});
	it('returns `go` for a go.mod project', () => {
		expect(matchLanguage(reader({ 'go.mod': 'module x' }))).toBe('go');
	});
	it('returns `rust` for a Cargo.toml project', () => {
		expect(matchLanguage(reader({ 'Cargo.toml': '[package]' }))).toBe(
			'rust',
		);
	});
	it('returns `unknown` for an empty project', () => {
		expect(matchLanguage(reader({}))).toBe('unknown');
	});
	it('returns `unknown` for a project with no manifest at all', () => {
		// `pkg === undefined` AND no other indicator.
		expect(matchLanguage(reader({}), undefined)).toBe('unknown');
	});
	it('typescript outranks a stray pyproject.toml (priority order preserved)', () => {
		expect(
			matchLanguage(
				reader({
					'tsconfig.json': '{}',
					'pyproject.toml': '[project]',
				}),
			),
		).toBe('typescript');
	});
	it('a custom rule table outranks the defaults (e.g. a host wants `rust` over `typescript`)', () => {
		// Host that knows their monorepo is Rust + TypeScript mixed:
		// the Cargo manifest signals `rust` even when tsconfig.json
		// is also present.
		const result = matchLanguage(
			reader({
				'tsconfig.json': '{}',
				'Cargo.toml': '[package]',
			}),
			undefined,
			[
				{
					id: 'rust',
					priority: 1000,
					evidence: { kind: 'exists', path: 'Cargo.toml' },
				},
				...DEFAULT_LANGUAGE_RULES,
			],
		);
		expect(result).toBe('rust');
	});
});

describe('integration: detectLanguage uses the rule table', () => {
	it('analyzer classifies a TypeScript+Angular project correctly', () => {
		const analysis = analyzeProject(
			reader({
				'tsconfig.json': '{}',
				'package.json': JSON.stringify({
					name: 'app',
					dependencies: { '@angular/core': '^22' },
				}),
			}),
		);
		expect(analysis.language).toBe('typescript');
	});
});
