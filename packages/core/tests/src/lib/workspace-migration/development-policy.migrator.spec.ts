/**
 * development-policy.migrator.spec.ts — a workspace that never stated a
 * development model gets one on startup, and a workspace that did is left
 * exactly as it was.
 *
 * The cases here are the ones where a migration can do harm: overwriting
 * a decision, destroying a human's formatting, or writing a block the
 * runtime would then refuse at startup.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { validateDevelopmentPolicy } from '@delendai/core/lib/development-policy/validate';
import { createDevelopmentPolicyMigrator } from '@delendai/core/lib/workspace-migration/migrators/development-policy.migrator';

const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

/** A git repository with a config file, on a branch we choose. */
const workspace = (config: string, branch = 'develop'): string => {
	const root = mkdtempSync(join(tmpdir(), 'dev-policy-migrator-'));
	directories.push(root);
	const git = (...args: readonly string[]): void => {
		execFileSync('git', [...args], { cwd: root, stdio: 'ignore' });
	};
	git('init', '--quiet', '--initial-branch', branch);
	git('config', 'user.name', 'Test');
	git('config', 'user.email', 'test@example.com');
	writeFileSync(join(root, 'delendai.config.json'), config);
	git('add', '-A');
	git('commit', '--quiet', '-m', 'base');
	return root;
};

const migrator = createDevelopmentPolicyMigrator();
const ctx = (workspaceRoot: string) => ({ workspaceRoot, dryRun: false });

const readConfig = (root: string): string =>
	readFileSync(join(root, 'delendai.config.json'), 'utf8');

describe('the development-policy migrator', () => {
	it('gives a workspace with no development block one', async () => {
		const root = workspace('{\n\t"version": 1\n}\n');

		expect(await migrator.detect(ctx(root))).toBe(true);
		await migrator.apply(ctx(root));

		const written = JSON.parse(readConfig(root)) as {
			development?: { profile?: string };
		};
		expect(written.development?.profile).toBeDefined();
	});

	it('writes a block the runtime actually accepts', async () => {
		// A migration that leaves the workspace failing startup validation
		// has made it worse than it found it.
		const root = workspace('{\n\t"version": 1\n}\n');
		await migrator.apply(ctx(root));

		const written = JSON.parse(readConfig(root)) as {
			development?: Record<string, unknown>;
		};
		const violations = validateDevelopmentPolicy(
			resolveDevelopmentPolicy({ development: written.development }),
		).map((violation) => violation.rule);
		expect(violations).toEqual([]);
	});

	it('integrates on the branch the workspace is on, not on `develop`', async () => {
		const root = workspace('{\n\t"version": 1\n}\n', 'trabajo');
		await migrator.apply(ctx(root));

		const written = JSON.parse(readConfig(root)) as {
			development?: { branches?: { integration?: string } };
		};
		expect(written.development?.branches?.integration).toBe('trabajo');
	});

	it('never touches a workspace that already decided', async () => {
		const before =
			'{\n\t"version": 1,\n\t"development": { "profile": "worktree-pr" }\n}\n';
		const root = workspace(before);

		expect(await migrator.detect(ctx(root))).toBe(false);
		await migrator.apply(ctx(root));
		expect(readConfig(root)).toBe(before);
	});

	it('keeps comments and formatting, which a JSON round trip would delete', async () => {
		const before =
			'{\n\t// this comment is load-bearing for somebody\n\t"version": 1\n}\n';
		const root = workspace(before);
		await migrator.apply(ctx(root));

		const after = readConfig(root);
		expect(after).toContain('// this comment is load-bearing for somebody');
	});

	it('plans the reasons, so a dry run says why before anything is written', async () => {
		const root = workspace('{\n\t"version": 1\n}\n');
		const steps = await migrator.plan(ctx(root));

		expect(steps[0]?.kind).toBe('write-development-block');
		// A migration an operator cannot audit is one they have to trust.
		expect(
			steps.filter((step) => step.kind === 'because').length,
		).toBeGreaterThan(0);
	});

	it('does nothing at all where there is no config file to migrate', async () => {
		// Creating one here would be inventing a project, not migrating it.
		const root = mkdtempSync(join(tmpdir(), 'dev-policy-empty-'));
		directories.push(root);
		expect(await migrator.detect(ctx(root))).toBe(false);
		expect(await migrator.plan(ctx(root))).toEqual([]);
	});
});
