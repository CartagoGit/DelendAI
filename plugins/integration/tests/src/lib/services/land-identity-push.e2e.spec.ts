/**
 * land-identity-push.e2e.spec.ts — a push of the integrator is the
 * identity's or it does not happen: with no token nothing reaches the
 * remote, and a batch is not pushed either. Real git against a local remote.
 */
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createGitRepoTemplate } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import { pushAsIdentity } from '../../../../src/lib/services/land-identity-push.helper';
import { assembleTrain } from '../../../../src/lib/services/land-train-assembly.helper';

const template = createGitRepoTemplate({
	trunk: 'develop',
	remote: true,
	files: { 'a.ts': 'a\n' },
});

const remoteRef = (git: (...args: string[]) => string, ref: string): string =>
	git('ls-remote', 'origin', `refs/heads/${ref}`);

describe('the integrator push', () => {
	it('[<5000ms] refuses without a token and pushes nothing', () => {
		const { root, git } = template.copy();
		const refused = pushAsIdentity({
			cwd: root,
			remote: 'origin',
			refspec: 'HEAD:refs/heads/x',
			token: '',
		});
		expect(refused).toContain('no identity token');
		expect(remoteRef(git, 'x')).toBe('');
	});

	it('[<5000ms] pushes with a token', () => {
		const { root, git } = template.copy();
		expect(
			pushAsIdentity({
				cwd: root,
				remote: 'origin',
				refspec: 'HEAD:refs/heads/x',
				token: 't',
			}),
		).toBeUndefined();
		expect(remoteRef(git, 'x')).not.toBe('');
	});

	it('[<5000ms] leaves a batch unpushed when the assembly has no identity token', () => {
		const { root, git } = template.copy();
		const tip = git('rev-parse', 'HEAD');
		git('switch', '-q', '-c', 'topic');
		writeFileSync(join(root, 'b.ts'), 'b\n');
		git('add', '-A');
		git('commit', '-q', '-m', 'b');
		git('push', '-q', 'origin', 'topic');
		const head = git('rev-parse', 'HEAD');
		git('switch', '-q', 'develop');
		const built = assembleTrain({
			root,
			remote: 'origin',
			tipSha: tip,
			ref: 'batch-1',
			members: [{ number: 1, headRef: 'topic', headSha: head }],
			derived: new Set(),
			regenerate: () => true,
			linkDependencies: () => true,
		});
		expect(built.pushFailure).toContain('no identity token');
		expect(remoteRef(git, 'batch-1')).toBe('');
	});

	it('[<5000ms] runs no client hook: a failing pre-commit and pre-push stop neither the batch commit nor the push', () => {
		const { root, git } = template.copy();
		for (const hook of ['pre-commit', 'pre-push', 'pre-merge-commit']) {
			const path = join(root, '.git', 'hooks', hook);
			writeFileSync(path, '#!/bin/sh\necho "hook refused"\nexit 1\n');
			chmodSync(path, 0o755);
		}
		const tip = git('rev-parse', 'HEAD');
		// Control: the person's own push is refused by the hook.
		expect(() => git('push', 'origin', 'HEAD:refs/heads/own')).toThrow();
		git('-c', 'core.hooksPath=/dev/null', 'switch', '-q', '-c', 'topic');
		writeFileSync(join(root, 'b.ts'), 'b\n');
		git('add', '-A');
		git('-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'b');
		git('-c', 'core.hooksPath=/dev/null', 'push', '-q', 'origin', 'topic');
		const head = git('rev-parse', 'HEAD');
		git('switch', '-q', 'develop');
		const built = assembleTrain({
			root,
			remote: 'origin',
			tipSha: tip,
			ref: 'batch-1',
			members: [{ number: 1, headRef: 'topic', headSha: head }],
			derived: new Set(),
			regenerate: () => true,
			linkDependencies: () => true,
			identityToken: 't',
		});
		expect(built.pushFailure).toBeUndefined();
		expect(remoteRef(git, 'batch-1')).not.toBe('');
	});

	it('[<5000ms] reports what a refusing remote hook said', () => {
		const { root, git } = template.copy();
		const remote = git('remote', 'get-url', 'origin');
		const hook = join(remote, 'hooks', 'pre-receive');
		writeFileSync(
			hook,
			'#!/bin/sh\necho "reason on stdout"\necho "reason on stderr" >&2\nexit 1\n',
		);
		chmodSync(hook, 0o755);
		const failure = pushAsIdentity({
			cwd: root,
			remote: 'origin',
			refspec: 'HEAD:refs/heads/y',
			token: 't',
		});
		expect(failure).toContain('reason on stderr');
	});
});
