/**
 * land-pass-equivalence.spec.ts — `delendai integration pass` and this
 * repository's land script are one pass: the same inputs give the same
 * lines and the same forge calls, in the same order.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import type { ILandForge } from '@delendai/core/cli';
import { afterAll, describe, expect, it } from 'vitest';

import { runIntegrationPassCommand } from '../../../packages/cli/src/commands/integration-pass.command';

import { REPO_AUTHORITIES } from '../gen/repo-authorities.constant';

import { createFakeWorld } from './land-fake';
import { readDevelopmentConfig } from './land-policy';
import { REPO_LAND_WORKFLOW } from './land-workflow.script';
import { runLandScript } from './land.script';

const DEVELOPMENT = {
	branches: {
		integration: 'develop',
		release: 'main',
		namespacePrefix: 'delendai',
	},
	integration: {
		engine: 'land',
		protocol: 1,
		requiredChecks: ['tests: a'],
		zones: ['a', 'b'],
	},
};
const POLICY = resolveDevelopmentPolicy({ development: DEVELOPMENT });
const ENV = { GITHUB_REPOSITORY: 'owner/name', GH_TOKEN: 'unused' };

/** The forge of a fresh world with three ready pull requests, every call recorded. */
const world = () => {
	const fake = createFakeWorld();
	fake.world.addPull({ 'a/one.ts': '1' });
	fake.world.addPull({ 'a/two.ts': '2' });
	fake.world.addPull({ 'b/three.ts': '3' });
	fake.world.ci();
	const calls: string[] = [];
	const forge = new Proxy(fake.forge, {
		get: (target, name: keyof ILandForge) => {
			const member = target[name] as (...args: unknown[]) => unknown;
			return (...args: unknown[]) => {
				calls.push(`${String(name)}(${JSON.stringify(args)})`);
				return member.apply(target, args);
			};
		},
	});
	return {
		calls,
		ports: {
			forge,
			git: fake.git,
			bringForward: () => Promise.resolve('moved' as const),
		},
	};
};

const cwd = mkdtempSync(join(tmpdir(), 'pass-equivalence-'));
writeFileSync(
	join(cwd, 'delendai.config.json'),
	JSON.stringify({ development: DEVELOPMENT }),
);
afterAll(() => rmSync(cwd, { recursive: true, force: true }));

describe('the land script and `integration pass`', () => {
	it('[<100ms] decide the same and call the forge the same, in order', async () => {
		const script = world();
		const scriptLines: string[] = [];
		const scriptCode = await runLandScript({
			root: cwd,
			policy: POLICY,
			env: ENV,
			ports: script.ports,
			log: (line) => scriptLines.push(line),
		});
		const product = world();
		const result = await runIntegrationPassCommand(
			{ cwd } as never,
			() => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
			ENV,
			product.ports,
		);
		expect(scriptCode).toBe(0);
		expect(result.code).toBe(0);
		expect(scriptLines.length).toBeGreaterThan(1);
		expect(result.text).toBe(scriptLines.join('\n'));
		expect(product.calls).toEqual(script.calls);
		expect(script.calls.some((call) => call.startsWith('merge('))).toBe(
			true,
		);
	});

	it("[<100ms] are fed by this repository's policy, which names what gen:all rebuilds", () => {
		const { integration } = resolveDevelopmentPolicy(
			readDevelopmentConfig(),
		);
		const rebuilt = REPO_AUTHORITIES.filter(
			(declaration) => declaration.rebuild === 'bun run gen:all',
		).flatMap((declaration) =>
			declaration.projections.map((projection) => projection.path),
		);
		expect([...integration.derived.paths].sort()).toEqual(rebuilt.sort());
		expect(REPO_LAND_WORKFLOW.passCommand).toBe(
			'bun packages/cli/src/index.ts integration pass',
		);
	});
});
