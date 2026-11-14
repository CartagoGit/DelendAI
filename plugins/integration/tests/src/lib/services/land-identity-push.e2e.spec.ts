/**
 * land-identity-push.e2e.spec.ts — a push of the integrator is the
 * identity's or it does not happen: with no token nothing reaches the
 * remote, and a batch is not pushed either. Real git against a local remote.
 */
import { writeFileSync } from 'node:fs';
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
});
