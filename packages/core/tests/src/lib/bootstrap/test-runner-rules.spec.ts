// test-runner-rules.spec.ts: pin the SOLID test-runner table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_TEST_RUNNER_RULES,
	matchTestRunner,
} from '@mcp-vertex/core/lib/bootstrap/test-runner-rules';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async () => [],
});

describe('DEFAULT_TEST_RUNNER_RULES (declarative table)', async () => {
	it('lists the six built-in entries (vitest, jest × has-dep/script-regex, bun, node)', async () => {
		const ids = DEFAULT_TEST_RUNNER_RULES.map((r) => r.id);
		// vitest appears twice (has-dep + script-regex), jest twice.
		expect(ids).toContain('vitest');
		expect(ids).toContain('jest');
		expect(ids).toContain('bun');
		expect(ids).toContain('node');
	});
	it('vitest (has-dep) outranks vitest (script-regex)', async () => {
		const vitestDep = DEFAULT_TEST_RUNNER_RULES.find(
			(r) => r.id === 'vitest' && r.evidence.kind === 'has-dep',
		);
		const vitestScript = DEFAULT_TEST_RUNNER_RULES.find(
			(r) => r.id === 'vitest' && r.evidence.kind === 'script-regex',
		);
		expect(vitestDep?.priority).toBeGreaterThan(
			vitestScript?.priority ?? 0,
		);
	});
});

describe('matchTestRunner', async () => {
	it('returns `vitest` when `vitest` is in deps', async () => {
		expect(matchTestRunner({ vitest: '^1' }, {})).toBe('vitest');
	});
	it('returns `jest` when `jest` is in deps', async () => {
		expect(matchTestRunner({ jest: '^29' }, {})).toBe('jest');
	});
	it('returns `vitest` when scripts.test mentions vitest (no deps)', async () => {
		expect(matchTestRunner({}, { test: 'vitest run' })).toBe('vitest');
	});
	it('returns `jest` when scripts.test mentions jest (no deps)', async () => {
		expect(matchTestRunner({}, { test: 'jest' })).toBe('jest');
	});
	it('returns `bun` when scripts.test runs `bun test`', async () => {
		expect(matchTestRunner({}, { test: 'bun test' })).toBe('bun');
	});
	it('returns `node` when scripts.test runs `node --test`', async () => {
		expect(matchTestRunner({}, { test: 'node --test' })).toBe('node');
	});
	it('returns `unknown` when there is no test signal', async () => {
		expect(matchTestRunner({}, {})).toBe('unknown');
	});
	it('returns `unknown` when there is no `test` script (only other scripts)', async () => {
		expect(matchTestRunner({}, { build: 'tsc' })).toBe('unknown');
	});
	it('has-dep outranks script-regex: vitest in deps beats vitest in script', async () => {
		// Even if scripts.test mentions jest, the presence of
		// vitest in deps wins.
		expect(matchTestRunner({ vitest: '^1' }, { test: 'jest' })).toBe(
			'vitest',
		);
	});
});

describe('integration: detectTestRunner uses the rule table', async () => {
	it('analyzer picks vitest when vitest is in devDependencies', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'svc',
					devDependencies: { vitest: '^1' },
				}),
			}),
		);
		expect(analysis.testRunner).toBe('vitest');
	});
	it('analyzer picks jest when scripts.test is `jest`', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'svc',
					scripts: { test: 'jest' },
				}),
			}),
		);
		expect(analysis.testRunner).toBe('jest');
	});
});
