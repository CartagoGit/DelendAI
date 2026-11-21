/**
 * namespace-rename.service.e2e.spec.ts — the rename against a real clone
 * and a real bare remote.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import {
	gitNamespaceRenamePorts,
	renameNamespace,
} from '@delendai/core/lib/work-units/namespace-rename.service';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
});

const OLD = 'delendai/wip/a/implement/x1-S1-g1/work';

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

describe('gitNamespaceRenamePorts', () => {
	it('[<1500ms] moves a real remote branch with an identical tip and keeps the old one retired', () => {
		const remote = mkdtempSync(join(tmpdir(), 'ns-rename-remote-'));
		const root = mkdtempSync(join(tmpdir(), 'ns-rename-'));
		dirs.push(remote, root);
		const run = (cwd: string, ...args: string[]): string =>
			execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
		run(remote, 'init', '-q', '--bare');
		run(root, 'init', '-q', '-b', 'develop');
		run(root, 'config', 'user.email', 'a@example.com');
		run(root, 'config', 'user.name', 'A');
		run(root, 'config', 'commit.gpgsign', 'false');
		run(root, 'commit', '-q', '--allow-empty', '-m', 'base');
		run(root, 'remote', 'add', 'origin', remote);
		const tip = run(root, 'rev-parse', 'HEAD');
		run(root, 'push', '-q', 'origin', `HEAD:refs/heads/${OLD}`);
		const ports = gitNamespaceRenamePorts({
			root,
			remote: 'origin',
			openPullRequestHeads: () => [],
		});
		const report = renameNamespace({ policy, ports, apply: true });
		expect(report.refs.map((ref) => ref.outcome)).toEqual(['renamed']);
		expect(
			run(
				remote,
				'rev-parse',
				'wip/a/implement/x1-S1-g1/work'.replace(/^/u, 'refs/heads/'),
			),
		).toBe(tip);
		expect(run(root, 'rev-parse', `refs/retired/${OLD}`)).toBe(tip);
		expect(run(remote, 'branch', '--list', OLD)).toBe('');
	});
});
