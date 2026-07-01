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
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async () => [],
});

describe('DEFAULT_PACKAGE_RUNNERS (declarative table)', async () => {
	it('lists the five runner variants', async () => {
		const ids = DEFAULT_PACKAGE_RUNNERS.map((r) => r.id);
		expect(ids).toContain('bun');
		expect(ids).toContain('pnpm');
		expect(ids).toContain('yarn');
		expect(ids).toContain('npm');
		expect(ids).toContain('unknown');
	});
	it('uses `run` infix for bun and npm, omits it for pnpm and yarn', async () => {
		expect(runnerFor('bun')).toBe('bun run');
		expect(runnerFor('npm')).toBe('npm run');
		expect(runnerFor('pnpm')).toBe('pnpm');
		expect(runnerFor('yarn')).toBe('yarn');
	});
	it('falls back to `npm run` for the unknown case', async () => {
		expect(runnerFor('unknown')).toBe('npm run');
	});
});

describe('integration: recommendServerPlan uses runnerFor', async () => {
	it('emits `bun run <role>` for a bun project', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'svc',
					scripts: { test: 'vitest' },
				}),
				'bun.lock': '',
				'tsconfig.json': '{}',
			}),
		);
		const plan = await recommendServerPlan(analysis);
		expect(plan.validationCommands.test).toBe('bun run test');
	});
	it('emits `pnpm <role>` for a pnpm project (no `run` infix)', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: 'svc',
					scripts: { test: 'vitest' },
				}),
				'pnpm-lock.yaml': '',
				'tsconfig.json': '{}',
			}),
		);
		const plan = await recommendServerPlan(analysis);
		expect(plan.validationCommands.test).toBe('pnpm test');
	});
});
