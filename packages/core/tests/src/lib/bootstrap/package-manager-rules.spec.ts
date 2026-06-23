// package-manager-rules.spec.ts: pin the SOLID package-manager table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_PACKAGE_MANAGER_RULES,
	matchPackageManager,
} from '@mcp-vertex/core/lib/bootstrap/package-manager-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => [],
});

describe('DEFAULT_PACKAGE_MANAGER_RULES (declarative table)', () => {
	it('lists the four built-in managers', () => {
		const ids = DEFAULT_PACKAGE_MANAGER_RULES.map((r) => r.id);
		expect(ids).toEqual(['bun', 'pnpm', 'yarn', 'npm']);
	});
	it('bun outranks npm (a monorepo may carry both bun.lock and package-lock.json)', () => {
		const bun = DEFAULT_PACKAGE_MANAGER_RULES.find((r) => r.id === 'bun');
		const npm = DEFAULT_PACKAGE_MANAGER_RULES.find((r) => r.id === 'npm');
		expect(bun?.priority).toBeGreaterThan(npm?.priority ?? 0);
	});
});

describe('matchPackageManager', () => {
	it('returns `bun` for a project with bun.lock', () => {
		expect(matchPackageManager(reader({ 'bun.lock': '...' }))).toBe('bun');
	});
	it('returns `bun` for a project with bun.lockb (the binary lockfile)', () => {
		expect(matchPackageManager(reader({ 'bun.lockb': 'binary' }))).toBe(
			'bun',
		);
	});
	it('returns `pnpm` for a project with pnpm-lock.yaml', () => {
		expect(matchPackageManager(reader({ 'pnpm-lock.yaml': '...' }))).toBe(
			'pnpm',
		);
	});
	it('returns `yarn` for a project with yarn.lock', () => {
		expect(matchPackageManager(reader({ 'yarn.lock': '...' }))).toBe(
			'yarn',
		);
	});
	it('returns `npm` for a project with package-lock.json', () => {
		expect(
			matchPackageManager(reader({ 'package-lock.json': '...' })),
		).toBe('npm');
	});
	it('returns `unknown` when no lockfile is present', () => {
		expect(matchPackageManager(reader({}))).toBe('unknown');
	});
	it('priority order: bun beats npm when both lockfiles are present', () => {
		expect(
			matchPackageManager(
				reader({ 'bun.lock': '...', 'package-lock.json': '...' }),
			),
		).toBe('bun');
	});
});

describe('integration: detectPackageManager uses the rule table', () => {
	it('analyzer detects bun for a project with bun.lock + tsconfig', () => {
		const analysis = analyzeProject(
			reader({
				'bun.lock': '...',
				'tsconfig.json': '{}',
				'package.json': '{"name":"svc"}',
			}),
		);
		expect(analysis.packageManager).toBe('bun');
	});
});
