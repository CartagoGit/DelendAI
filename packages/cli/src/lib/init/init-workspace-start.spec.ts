/**
 * init-workspace-start.spec.ts — what `init` leaves behind starts, for
 * every profile init can adopt, and follows the project it ran in.
 *
 * A workspace "starts" when the policy it declares survives the same
 * validation the server applies at boot; an enforced profile with no
 * required check did not, and the host only ever showed a closed
 * connection.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readWorkspacePolicy } from '@delendai/core/cli';
import {
	parseJsonc,
	resolveDevelopmentPolicy,
	validateDevelopmentPolicy,
} from '@delendai/core/public';

import { createNoopContext } from '../noop-context.factory';
import type { ICliCommandContext } from '../../contracts/interfaces/cli-command.interface';
import { runInitWithAnswers } from '../../commands/init/init.command';
import { InitAnswers } from './init-answers.schema';
import {
	adoptDevelopmentForInit,
	forgePluginExclusions,
} from './init-development-setup.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): void => {
	execFileSync('git', args, { cwd, stdio: 'ignore' });
};

const consumer = (options: { workflow?: string } = {}): string => {
	const root = mkdtempSync(join(tmpdir(), 'init-start-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'i@example.invalid');
	git(root, 'config', 'user.name', 'I');
	writeFileSync(join(root, 'package.json'), '{"name":"consumer"}\n');
	if (options.workflow !== undefined) {
		mkdirSync(join(root, '.github/workflows'), { recursive: true });
		writeFileSync(join(root, '.github/workflows/ci.yml'), options.workflow);
	}
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	return root;
};

const contextFor = (cwd: string): ICliCommandContext =>
	createNoopContext(cwd, {
		workspace: cwd,
		remote: undefined,
		json: true,
		format: 'json',
		lang: 'en',
		noColor: true,
		plugins: [],
		preset: undefined,
		config: undefined,
		extraOptions: undefined,
		agentWorktree: undefined,
	});

const CI =
	'name: CI\non:\n  pull_request:\njobs:\n  validate:\n    runs-on: x\n';
const github = async () => ({
	hasDevelopmentBlock: false,
	forge: 'github' as const,
	canRequireChecks: true,
	currentBranch: 'develop',
	existingBranches: ['develop'],
});

const starts = (root: string) => {
	const config = parseJsonc(
		readFileSync(join(root, 'delendai.config.json'), 'utf8'),
	).value as { development?: Record<string, unknown> };
	return validateDevelopmentPolicy(
		resolveDevelopmentPolicy({ development: config.development }),
	);
};

describe('init on a project with no forge and no workflow', () => {
	it('adopts a profile that starts, installs the hooks, and enables no forge plugin', async () => {
		const root = consumer();
		const result = await runInitWithAnswers(
			contextFor(root),
			{ dryRun: false, force: false },
			InitAnswers.parse({ workspaceRoot: root, preset: 'dogfood' }),
		);
		expect(result.code).toBe(0);
		expect(starts(root)).toEqual([]);

		const config = parseJsonc(
			readFileSync(join(root, 'delendai.config.json'), 'utf8'),
		).value as {
			development: { profile: string };
			plugins: Record<string, { enabled?: boolean }>;
		};
		expect(config.development.profile).toBe('shared-checkout-merge');
		for (const forgePlugin of ['forge', 'github', 'gitlab', 'issues']) {
			expect(config.plugins[forgePlugin]?.enabled).toBe(false);
		}
		expect(existsSync(join(root, '.git/hooks/pre-commit'))).toBe(true);
		expect(await readWorkspacePolicy(root)).toBeDefined();
	});

	it('writes the file its host instructions point at', async () => {
		const root = consumer();
		await runInitWithAnswers(
			contextFor(root),
			{ dryRun: false, force: false },
			InitAnswers.parse({ workspaceRoot: root }),
		);
		expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toContain(
			'docs/delendai/host-hints/agent-instructions.generated.md',
		);
		expect(
			existsSync(
				join(
					root,
					'docs/delendai/host-hints/agent-instructions.generated.md',
				),
			),
		).toBe(true);
	});

	it('leaves the hooks alone where the project turned them off', async () => {
		const root = consumer();
		writeFileSync(
			join(root, 'delendai.config.json'),
			'{"development":{"profile":"shared-checkout-merge","guardHooks":"off"}}\n',
		);
		await runInitWithAnswers(
			contextFor(root),
			{ dryRun: false, force: false },
			InitAnswers.parse({ workspaceRoot: root }),
		);
		expect(existsSync(join(root, '.git/hooks/pre-commit'))).toBe(false);
	});
});

describe('adoption for init on a github project', () => {
	it('gives the pull-request profile the check its workflow reports', async () => {
		const root = consumer({ workflow: CI });
		const adoption = await adoptDevelopmentForInit(root, github);
		expect(adoption?.block?.profile).toBe('shared-checkout-pr');
		expect(adoption?.block?.integration?.requiredChecks).toEqual([
			'validate',
		]);
		const violations = validateDevelopmentPolicy(
			resolveDevelopmentPolicy({ development: adoption?.block }),
		);
		expect(violations).toEqual([]);
	});

	it('falls back to the merge profile rather than write a workspace that cannot start', async () => {
		const adoption = await adoptDevelopmentForInit(consumer(), github);
		expect(adoption?.block?.profile).toBe('shared-checkout-merge');
	});

	it('never rewrites a project that already declares its model', async () => {
		const root = consumer();
		writeFileSync(
			join(root, 'delendai.config.json'),
			'{"development":{"profile":"worktree-pr"}}\n',
		);
		expect(await adoptDevelopmentForInit(root, github)).toBeUndefined();
	});
});

describe('forge plugins follow the remote', () => {
	it('keeps the matching forge plugins and drops the rest', () => {
		expect(forgePluginExclusions('github', [])).toContain('gitlab');
		expect(forgePluginExclusions('github', [])).not.toContain('forge');
		expect(forgePluginExclusions('none', [])).toContain('forge');
	});

	it('never takes away a plugin that was asked for by name', () => {
		expect(forgePluginExclusions('none', ['issues'])).not.toContain(
			'issues',
		);
	});
});
