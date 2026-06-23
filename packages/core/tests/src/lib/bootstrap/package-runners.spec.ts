// package-runners.spec.ts: pin the SOLID runner table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_PACKAGE_RUNNERS,
	runnerFor,
} from '@mcp-vertex/core/lib/bootstrap/package-runners';
import { recommendServerPlan } from '@mcp-vertex/core/lib/bootstrap/recommend-plan';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => [],
});

describe('DEFAULT_PACKAGE_RUNNERS (declarative table)', () => {
	it('lists the five runner variants', () => {
		const ids = DEFAULT_PACKAGE_RUNNERS.map((r) => r.id);
		expect(ids).toContain('bun');
		expect(ids).toContain('pnpm');
		expect(ids).toContain('yarn');
		expect(ids).toContain('npm');
		expect(ids).toContain('unknown');
	});
	it('uses `run` infix for bun and npm, omits it for pnpm and yarn', () => {
		expect(runnerFor('bun')).toBe('bun run');
		expect(runnerFor('npm')).toBe('npm run');
		expect(runnerFor('pnpm')).toBe('pnpm');
		expect(runnerFor('yarn')).toBe('yarn');
	});
	it('falls back to `npm run` for the unknown case', () => {
		expect(runnerFor('unknown')).toBe('npm run');
	});
});

describe('integration: recommendServerPlan uses runnerFor', () => {
	it('emits `bun run <role>` for a bun project', () => {
		const analysis = analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'svc',
					scripts: { test: 'vitest' },
				}),
				'bun.lock': '',
				'tsconfig.json': '{}',
			}),
		);
		const plan = recommendServerPlan(analysis);
		expect(plan.validationCommands.test).toBe('bun run test');
	});
	it('emits `pnpm <role>` for a pnpm project (no `run` infix)', () => {
		const analysis = analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'svc',
					scripts: { test: 'vitest' },
				}),
				'pnpm-lock.yaml': '',
				'tsconfig.json': '{}',
			}),
		);
		const plan = recommendServerPlan(analysis);
		expect(plan.validationCommands.test).toBe('pnpm test');
	});
});
