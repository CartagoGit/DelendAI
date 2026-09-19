/**
 * Installing the guard beside a project's own hooks, over real
 * repositories: a plain one, one shaped like the observed adopter project
 * (`core.hooksPath=.husky` with existing hooks that read stdin), and ones
 * managed by tools that rewrite hook files.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
	inspectGuardHooks,
	installGuardHooks,
	locateHooks,
	uninstallGuardHooks,
} from './guard-hooks.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const repo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'guard-install-'));
	roots.push(root);
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' });
	git('init', '-q', '-b', 'develop');
	git('config', 'user.email', 'install@example.com');
	git('config', 'user.name', 'Install');
	git('config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'README.md'), '# r\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'base');
	return root;
};

const CLI_ENTRY = resolve(
	fileURLToPath(new URL('.', import.meta.url)),
	'..',
	'index.ts',
);
const invocation = { runner: 'bun', entry: CLI_ENTRY };

describe('installing into a plain repository', () => {
	it('creates every guarded hook, is idempotent, and uninstalls without a trace', () => {
		const root = repo();
		const hooksDir = locateHooks(root).dir;
		const before = readdirSync(hooksDir).sort();

		const first = installGuardHooks(root, invocation);
		expect(first.hooks.map((h) => h.state)).toEqual([
			'created',
			'created',
			'created',
			'created',
			'created',
		]);
		for (const hook of [
			'pre-commit',
			'reference-transaction',
			'pre-push',
			'post-checkout',
			'post-merge',
		]) {
			expect(statSync(join(hooksDir, hook)).mode & 0o111).not.toBe(0);
		}
		expect(
			installGuardHooks(root, invocation).hooks.map((h) => h.state),
		).toEqual([
			'unchanged',
			'unchanged',
			'unchanged',
			'unchanged',
			'unchanged',
		]);
		expect(
			inspectGuardHooks(root).hooks.every((h) => h.state === 'installed'),
		).toBe(true);

		expect(uninstallGuardHooks(root).hooks.map((h) => h.state)).toEqual([
			'removed',
			'removed',
			'removed',
			'removed',
			'removed',
		]);
		expect(readdirSync(hooksDir).sort()).toEqual(before);
		expect(
			inspectGuardHooks(root).hooks.every((h) => h.state === 'absent'),
		).toBe(true);
	});
});

describe('installing beside existing hooks under core.hooksPath', () => {
	it('keeps the project hooks running with their stdin, and restores them byte for byte', () => {
		const root = repo();
		const husky = join(root, '.husky');
		mkdirSync(husky);
		execFileSync('git', ['config', 'core.hooksPath', '.husky'], {
			cwd: root,
		});
		const seen = join(root, 'pre-push-saw.txt');
		const prePush = `#!/usr/bin/env bash\n# project hook\nwhile read -r local_ref local_sha remote_ref remote_sha; do\n  echo "$remote_ref" >> "${seen}"\ndone\n`;
		const refTx = '#!/usr/bin/env bash\n# bumps versions on tags\nexit 0\n';
		writeFileSync(join(husky, 'pre-push'), prePush);
		writeFileSync(join(husky, 'reference-transaction'), refTx);
		chmodSync(join(husky, 'pre-push'), 0o755);
		chmodSync(join(husky, 'reference-transaction'), 0o755);

		const report = installGuardHooks(root, invocation);
		expect(report.dir).toBe(husky);
		expect(report.hooks.map((h) => [h.hook, h.state])).toEqual([
			['pre-commit', 'created'],
			['reference-transaction', 'updated'],
			['pre-push', 'updated'],
			['post-checkout', 'created'],
			['post-merge', 'created'],
		]);

		// A bare remote, and a push the project's own pre-push must still see.
		const remote = mkdtempSync(join(tmpdir(), 'guard-remote-'));
		roots.push(remote);
		execFileSync('git', ['init', '-q', '--bare'], { cwd: remote });
		execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root });
		const pushed = spawnSync('git', ['push', '-q', 'origin', 'develop'], {
			cwd: root,
			encoding: 'utf8',
		});
		expect(pushed.status).toBe(0);
		expect(readFileSync(seen, 'utf8')).toBe('refs/heads/develop\n');

		uninstallGuardHooks(root);
		expect(readFileSync(join(husky, 'pre-push'), 'utf8')).toBe(prePush);
		expect(readFileSync(join(husky, 'reference-transaction'), 'utf8')).toBe(
			refTx,
		);
		expect(existsSync(join(husky, 'pre-commit'))).toBe(false);
	}, 60_000);
});

describe('what the guard does not write into', () => {
	it('reports a lefthook-managed project and writes nothing', () => {
		const root = repo();
		writeFileSync(
			join(root, 'lefthook.yml'),
			'pre-commit:\n  commands: {}\n',
		);
		const report = installGuardHooks(root, invocation);
		expect(report.hooks.every((h) => h.state === 'unsupported')).toBe(true);
		expect(report.hooks[0]?.reason).toContain('lefthook');
		expect(existsSync(join(locateHooks(root).dir, 'pre-commit'))).toBe(
			false,
		);
	});

	it('reports husky v9, whose hooks directory it regenerates', () => {
		const root = repo();
		execFileSync('git', ['config', 'core.hooksPath', '.husky/_'], {
			cwd: root,
		});
		const report = installGuardHooks(root, invocation);
		expect(report.hooks.every((h) => h.state === 'unsupported')).toBe(true);
		expect(report.hooks[0]?.reason).toContain('husky v9');
	});

	it('reports a hook that is not a shell script, and installs the others', () => {
		const root = repo();
		const dir = locateHooks(root).dir;
		const nodeHook = '#!/usr/bin/env node\nprocess.exit(0)\n';
		writeFileSync(join(dir, 'pre-push'), nodeHook);
		const report = installGuardHooks(root, invocation);
		expect(report.hooks.map((h) => h.state)).toEqual([
			'created',
			'created',
			'unsupported',
			'created',
			'created',
		]);
		expect(readFileSync(join(dir, 'pre-push'), 'utf8')).toBe(nodeHook);
	});
});

describe('the installed guard enforces the declared policy', () => {
	it('refuses a hand-made branch and a direct commit once installed', () => {
		const root = repo();
		writeFileSync(
			join(root, 'delendai.config.json'),
			'{ "development": { "profile": "shared-checkout-merge" } }',
		);
		installGuardHooks(root, invocation);
		const branch = spawnSync('git', ['switch', '-c', 'agent/x/y'], {
			cwd: root,
			encoding: 'utf8',
		});
		expect(branch.status).not.toBe(0);
		expect(branch.stderr).toContain('refused');
		const commit = spawnSync(
			'git',
			['commit', '-q', '-am', 'feat: direct'],
			{
				cwd: root,
				encoding: 'utf8',
			},
		);
		// Nothing staged would also fail; the guard's reason proves which.
		writeFileSync(join(root, 'a.ts'), 'export {};\n');
		spawnSync('git', ['add', 'a.ts'], { cwd: root });
		const direct = spawnSync(
			'git',
			['commit', '-q', '-m', 'feat: direct'],
			{
				cwd: root,
				encoding: 'utf8',
			},
		);
		expect(commit.status).not.toBe(0);
		expect(direct.status).not.toBe(0);
		expect(direct.stderr).toContain(
			'forbids committing directly to `develop`',
		);
	}, 60_000);
});
