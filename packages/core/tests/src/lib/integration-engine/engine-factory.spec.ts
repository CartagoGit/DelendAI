/**
 * engine-factory.spec.ts — the factory consumers actually call.
 *
 * Every other spec in this directory drives the cycle through a
 * harness that assembles the dependencies by hand. That is right for
 * testing the cycle, and it left `createIntegrationEngine` — the one
 * entry point a project outside this repository can reach — without a
 * test of its own. It was also, until this change, not on the public
 * surface at all.
 *
 * Against real git, because the factory's whole job is to bind to a
 * repository and refuse when it cannot.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createIntegrationEngine } from '@delendai/core/lib/integration-engine/index';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import { deriveCapabilities } from '@delendai/core/lib/development-policy/derive';
import { fakePartial } from '@delendai/test-kit';

import type { IIntegrationForge } from '@delendai/core/lib/integration-engine/forge-port.interface';
import type { IIntegrationStatePort } from '@delendai/core/lib/integration-engine/state-port.interface';

let root: string | undefined;

const git = (cwd: string, ...args: readonly string[]): string =>
	execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

const repository = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'delendai-engine-factory-'));
	root = dir;
	git(dir, 'init', '--quiet', '--initial-branch', 'develop');
	git(dir, 'config', 'user.name', 'Test');
	git(dir, 'config', 'user.email', 'test@example.com');
	git(dir, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(dir, 'a.txt'), 'base\n', 'utf8');
	git(dir, 'add', '-A');
	git(dir, 'commit', '--quiet', '--no-verify', '-m', 'base');
	return dir;
};

const options = (cwd: string) => ({
	cwd,
	policy: deriveCapabilities(expandProfile('shared-checkout-merge')),
	// The factory never touches the forge or the state port: it binds to
	// git and assembles. `fakePartial` says that out loud instead of
	// casting the emptiness away.
	forge: fakePartial<IIntegrationForge>({}),
	state: fakePartial<IIntegrationStatePort>({}),
});

afterEach(() => {
	if (root !== undefined) rmSync(root, { recursive: true, force: true });
	root = undefined;
});

describe('createIntegrationEngine', () => {
	it('binds to a repository and offers BOTH integration models', async () => {
		const engine = await createIntegrationEngine(options(repository()));

		expect(engine).toBeDefined();
		// A project on `shared-checkout-pr` needs the first; one on
		// `shared-checkout-merge` needs the second. Shipping a surface
		// with only one leaves that project unable to finish its work.
		expect(typeof engine?.runIntegrationCycle).toBe('function');
		expect(typeof engine?.runLocalMergeCycle).toBe('function');
		expect(typeof engine?.disposeWorkRef).toBe('function');
	});

	it('returns undefined outside a working tree rather than half-working', async () => {
		const outside = mkdtempSync(join(tmpdir(), 'delendai-not-a-repo-'));
		try {
			// A caller that cannot reach git must find that out HERE, not
			// halfway through an integration.
			expect(await createIntegrationEngine(options(outside))).toBe(
				undefined,
			);
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	});

	it('declines a merge on a policy that does not integrate by merge', async () => {
		const dir = repository();
		const engine = await createIntegrationEngine({
			...options(dir),
			policy: deriveCapabilities(expandProfile('shared-checkout-pr')),
		});

		const outcome = await engine?.runLocalMergeCycle(
			deriveCapabilities(expandProfile('shared-checkout-pr')),
			{ workRef: 'refs/wip/a/p-s-g1', remote: 'origin' },
		);

		// Reachable from the surface, and still refuses the wrong model:
		// the policy says which cycle applies, and the engine declines
		// rather than guessing.
		expect(outcome?.status).toBe('declined');
	});
	it('uses the clock and critical section it was given', async () => {
		// Both are optional, and their defaults are built inside the
		// factory — so a caller that supplies neither exercises a
		// different construction than one that supplies both. A project
		// injecting a deterministic clock for its own tests is the whole
		// reason those options exist.
		const entered: string[] = [];
		const engine = await createIntegrationEngine({
			...options(repository()),
			clock: () => 1_700_000_000_000,
			criticalSection: {
				run: async <T>(key: string, body: () => Promise<T>) => {
					entered.push(key);
					return body();
				},
			},
		});

		expect(engine?.deps.clock()).toBe(1_700_000_000_000);

		await engine?.runLocalMergeCycle(
			deriveCapabilities(expandProfile('shared-checkout-merge')),
			{ workRef: 'refs/wip/a/p-s-g1', remote: 'origin' },
		);

		// The injected section was the one that ran, not a default built
		// behind the caller's back.
		expect(entered).toEqual(['integration:develop']);
	});
	it('falls back to a real clock when none is given', async () => {
		// The complement of the case above: the default is built inside
		// the factory, so only a caller that supplies nothing reaches it.
		const before = Date.now();
		const engine = await createIntegrationEngine(options(repository()));
		const seen = engine?.deps.clock() ?? 0;

		expect(seen).toBeGreaterThanOrEqual(before);
	});
});
