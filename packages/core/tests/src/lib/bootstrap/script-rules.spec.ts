// script-rules.spec.ts: pin the SOLID declarative policy.
//
// The policy (primary roles, aliases, lifecycle blacklist) lives in
// script-rules.ts. These tests assert the contract the analyzer
// depends on.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	isBlacklistedScriptRole,
	LIFECYCLE_SCRIPT_BLACKLIST,
	QUALITY_ROLES,
	QUALITY_ROLE_ALIASES,
} from '@mcp-vertex/core/lib/bootstrap/script-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async () => [],
});

describe('QUALITY_ROLES / QUALITY_ROLE_ALIASES (declarative policy)', async () => {
	it('QUALITY_ROLES lists the four primary roles', async () => {
		expect(QUALITY_ROLES).toEqual(['lint', 'test', 'build', 'typecheck']);
	});
	it('QUALITY_ROLE_ALIASES contains the common type-check aliases', async () => {
		expect(QUALITY_ROLE_ALIASES['type-check']).toBe('typecheck');
	});
});

describe('LIFECYCLE_SCRIPT_BLACKLIST (declarative policy)', async () => {
	it('excludes the npm lifecycle hooks', async () => {
		expect(LIFECYCLE_SCRIPT_BLACKLIST.has('prepare')).toBe(true);
		expect(LIFECYCLE_SCRIPT_BLACKLIST.has('postinstall')).toBe(true);
		expect(LIFECYCLE_SCRIPT_BLACKLIST.has('prepublishOnly')).toBe(true);
	});
});

describe('isBlacklistedScriptRole', async () => {
	it('returns true for lifecycle hooks', async () => {
		expect(isBlacklistedScriptRole('prepare')).toBe(true);
		expect(isBlacklistedScriptRole('preinstall')).toBe(true);
	});
	it('returns true for `pre*` and `post*` companion scripts', async () => {
		expect(isBlacklistedScriptRole('pretest')).toBe(true);
		expect(isBlacklistedScriptRole('postbuild')).toBe(true);
	});
	it('returns false for real quality-gate scripts', async () => {
		expect(isBlacklistedScriptRole('lint')).toBe(false);
		expect(isBlacklistedScriptRole('test')).toBe(false);
		expect(isBlacklistedScriptRole('e2e')).toBe(false);
		expect(isBlacklistedScriptRole('format')).toBe(false);
	});
});

describe('analyzer integration: the policy drives picked scripts', async () => {
	it('picks quality roles, applies aliases, and skips lifecycle hooks', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'svc',
					scripts: {
						lint: 'eslint .',
						'type-check': 'tsc --noEmit',
						test: 'vitest',
						build: 'tsc',
						e2e: 'playwright',
						prepare: 'husky install',
						pretest: 'lefthook pre-commit',
						postinstall: 'echo skip',
					},
				}),
			}),
		);
		const scripts = analysis.scripts;
		// Picked.
		expect(scripts.lint).toBe('eslint .');
		expect(scripts.test).toBe('vitest');
		expect(scripts.build).toBe('tsc');
		// Alias normalised.
		expect(scripts.typecheck).toBe('tsc --noEmit');
		// Non-primary quality gate kept.
		expect(scripts.e2e).toBe('playwright');
		// Lifecycle hooks excluded.
		expect(scripts.prepare).toBeUndefined();
		expect(scripts.pretest).toBeUndefined();
		expect(scripts.postinstall).toBeUndefined();
	});
});
