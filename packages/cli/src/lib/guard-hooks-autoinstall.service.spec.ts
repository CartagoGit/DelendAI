/**
 * The guard arrives with the server, for a project that declares a policy.
 *
 * Advice can be ignored, and was: an adopter project's agent committed to
 * its integration branch and made its own worktrees after delendai refused.
 * A project that declares a `development` block therefore has the hooks
 * installed when its server starts — unless it says otherwise.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	ensureGuardHooks,
	guardHooksMode,
} from './guard-hooks-autoinstall.service';
import { locateHooks } from './guard-hooks.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const repo = (config?: string): string => {
	const root = mkdtempSync(join(tmpdir(), 'guard-auto-'));
	roots.push(root);
	execFileSync('git', ['init', '-q', '-b', 'develop'], { cwd: root });
	if (config !== undefined) {
		writeFileSync(join(root, 'delendai.config.json'), config);
	}
	return root;
};

const POLICY = '{ "development": { "profile": "shared-checkout-merge" } }';
const invocation = { runner: 'bun', entry: '/opt/delendai/cli.ts' };

describe('guardHooksMode', () => {
	it('installs by default when a policy is declared', async () => {
		expect(await guardHooksMode(repo(POLICY))).toBe('install');
	});

	it('honours an explicit choice', async () => {
		for (const mode of ['report', 'off', 'install'] as const) {
			const root = repo(
				`{ "development": { "profile": "shared-direct", "guardHooks": "${mode}" } }`,
			);
			expect(await guardHooksMode(root)).toBe(mode);
		}
	});

	it('is absent without a configuration, a development block, or parsable JSON', async () => {
		expect(await guardHooksMode(repo())).toBe('absent');
		expect(await guardHooksMode(repo('{ "plugins": {} }'))).toBe('absent');
		expect(await guardHooksMode(repo('{ "development": '))).toBe('absent');
	});
});

describe('ensureGuardHooks', () => {
	it('installs the hooks of a project that declares a policy', async () => {
		const root = repo(POLICY);
		const outcome = await ensureGuardHooks({
			workspaceRoot: root,
			...invocation,
		});
		expect(outcome.mode).toBe('install');
		expect(outcome.lines[0]).toContain('guard hooks installed in');
		expect(
			readFileSync(join(locateHooks(root).dir, 'pre-commit'), 'utf8'),
		).toContain('guard pre-commit');
		// Starting again changes nothing.
		const again = await ensureGuardHooks({
			workspaceRoot: root,
			...invocation,
		});
		expect(again.report?.hooks.every((h) => h.state === 'unchanged')).toBe(
			true,
		);
	});

	it('points the hooks at the CLI, whatever process installed them', async () => {
		// The server can be started by another entry entirely — this
		// repository's own host script does. A hook pointing at that would
		// start a server instead of judging the operation, and refuse
		// nothing; a probe through the real host entry committed straight
		// to the integration branch with the hooks "installed".
		const root = repo(POLICY);
		await ensureGuardHooks({ workspaceRoot: root });
		const hook = readFileSync(
			join(locateHooks(root).dir, 'pre-commit'),
			'utf8',
		);
		expect(hook).toContain(
			`${join('packages', 'cli', 'src', 'index.ts')}'`,
		);
		expect(hook).not.toContain('host-server.script.ts');
	});

	it('only reports when asked to, and writes nothing', async () => {
		const root = repo(
			'{ "development": { "profile": "shared-direct", "guardHooks": "report" } }',
		);
		const outcome = await ensureGuardHooks({
			workspaceRoot: root,
			...invocation,
		});
		expect(outcome.mode).toBe('report');
		expect(outcome.lines.join('\n')).toContain('pre-commit: absent');
		expect(existsSync(join(locateHooks(root).dir, 'pre-commit'))).toBe(
			false,
		);
	});

	it('leaves a project alone when it says off, or declares no policy', async () => {
		for (const config of [
			'{ "development": { "profile": "shared-direct", "guardHooks": "off" } }',
			undefined,
		]) {
			const root = repo(config);
			const outcome = await ensureGuardHooks({
				workspaceRoot: root,
				...invocation,
			});
			expect(outcome.lines).toEqual([]);
			expect(existsSync(join(locateHooks(root).dir, 'pre-commit'))).toBe(
				false,
			);
		}
	});

	it('reports a repository it cannot install into instead of failing the server', async () => {
		const notARepo = mkdtempSync(join(tmpdir(), 'guard-auto-plain-'));
		roots.push(notARepo);
		writeFileSync(join(notARepo, 'delendai.config.json'), POLICY);
		const outcome = await ensureGuardHooks({
			workspaceRoot: notARepo,
			...invocation,
		});
		expect(outcome.lines.join('\n')).toContain(
			'guard hooks could not be installed',
		);
	});
});
