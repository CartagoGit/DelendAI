/**
 * integration-certification-evidence.service.spec.ts — the integration
 * branch's certified run vouches for a close only when it is the newest
 * verdict and contains every commit the proposal shipped in.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveIntegrationCertificationEvidence } from '../../../../src/lib/services/integration-certification-evidence.service';
import { createGitRunner } from '../../../../src/lib/shared/git-runner';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repository with a delivered commit and a later integration tip. */
const repo = () => {
	const root = mkdtempSync(join(tmpdir(), 'cert-evidence-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'c@example.com');
	git(root, 'config', 'user.name', 'C');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'a.ts'), 'a\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	writeFileSync(join(root, 'b.ts'), 'b\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'delivered');
	const delivered = git(root, 'rev-parse', 'HEAD');
	writeFileSync(join(root, 'c.ts'), 'c\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'later');
	const tip = git(root, 'rev-parse', 'HEAD');
	git(root, 'checkout', '-q', '-b', 'elsewhere', 'HEAD~2');
	writeFileSync(join(root, 'd.ts'), 'd\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'never integrated');
	const stray = git(root, 'rev-parse', 'HEAD');
	git(root, 'checkout', '-q', 'develop');
	return { root, delivered, tip, stray };
};

const line = (sha: string, state: string) =>
	`${JSON.stringify({ sha, state, timestamp: '2026-09-26T10:00:00.000Z' })}\n`;

const resolve = (
	root: string,
	shas: readonly string[],
	log: string | undefined,
	integrationTip?: string,
) =>
	resolveIntegrationCertificationEvidence({
		workspaceRoot: root,
		shas,
		git: createGitRunner(root),
		// The certified commit is the current tip unless a test says not.
		integrationTip:
			integrationTip ??
			(log ?? '')
				.trim()
				.split('\n')
				.at(-1)
				?.match(/"sha":"([^"]+)"/u)?.[1],
		read: async () => log,
	});

describe('resolveIntegrationCertificationEvidence', () => {
	it('vouches when the newest verdict is certified and contains every shipped commit', async () => {
		const { root, delivered, tip } = repo();
		const evidence = await resolve(
			root,
			[delivered],
			line(tip, 'certified'),
		);
		expect(evidence).toMatchObject({ exitCode: 0, scope: 'global' });
	});

	it('does not vouch when a newer verdict is red, whatever came before', async () => {
		const { root, delivered, tip } = repo();
		expect(
			await resolve(
				root,
				[delivered],
				line(tip, 'certified') + line(tip, 'red'),
			),
		).toBeNull();
	});

	it('does not vouch for a commit the certified tree does not contain', async () => {
		const { root, delivered, tip, stray } = repo();
		expect(
			await resolve(root, [delivered, stray], line(tip, 'certified')),
		).toBeNull();
	});

	it('does not vouch when the certified commit is an earlier tip than the current one', async () => {
		const { root, delivered, tip } = repo();
		// develop moved on to a commit that is not certified yet.
		expect(
			await resolve(root, [delivered], line(tip, 'certified'), `${tip}0`),
		).toBeNull();
	});

	it('does not vouch when the current tip cannot be read', async () => {
		const { root, delivered, tip } = repo();
		expect(
			await resolveIntegrationCertificationEvidence({
				workspaceRoot: root,
				shas: [delivered],
				git: createGitRunner(root),
				integrationTip: undefined,
				read: async () => line(tip, 'certified'),
			}),
		).toBeNull();
	});

	it('does not vouch without a log or without shipped commits', async () => {
		const { root, delivered, tip } = repo();
		expect(await resolve(root, [delivered], undefined)).toBeNull();
		expect(await resolve(root, [], line(tip, 'certified'))).toBeNull();
	});
});
