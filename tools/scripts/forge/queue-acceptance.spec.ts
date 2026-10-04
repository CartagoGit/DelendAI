/**
 * queue-acceptance.spec.ts — the machine that brings candidates forward
 * judges them against the integration branch as it is now.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { branchesLandingAsTheyAre } from './queue-acceptance';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const CANDIDATE = 'delendai/pr/agent-a/implement/x00001-S1-g1/the-work';

/**
 * A forge, the owner machine's clone of it, and a second clone through
 * which the integration branch moves without the owner machine fetching.
 */
const project = () => {
	const base = mkdtempSync(join(tmpdir(), 'queue-acceptance-'));
	roots.push(base);
	const forge = join(base, 'origin.git');
	execFileSync('git', ['init', '-q', '--bare', '-b', 'develop', forge]);
	const clone = (name: string) => {
		const root = join(base, name);
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
		execFileSync('git', ['init', '-q', '-b', 'develop', root]);
		git('remote', 'add', 'origin', forge);
		git('config', 'user.email', `${name}@example.com`);
		git('config', 'user.name', name);
		git('config', 'commit.gpgsign', 'false');
		return { root, git };
	};
	const owner = clone('owner');
	writeFileSync(join(owner.root, 'shared.ts'), 'export const a = 1;\n');
	owner.git('add', '-A');
	owner.git('commit', '-q', '-m', 'base');
	owner.git('push', '-q', 'origin', 'develop');
	// The candidate changes the shared file, from the base.
	owner.git('switch', '-q', '-c', CANDIDATE);
	writeFileSync(join(owner.root, 'shared.ts'), 'export const a = 2;\n');
	owner.git('commit', '-qam', 'feat: the work');
	owner.git('push', '-q', 'origin', CANDIDATE);
	owner.git('switch', '-q', 'develop');
	owner.git('fetch', '-q', 'origin');
	const other = clone('other');
	other.git('fetch', '-q', 'origin');
	other.git('reset', '-q', '--hard', 'origin/develop');
	return { owner, other };
};

const landing = (root: string) =>
	branchesLandingAsTheyAre({
		root,
		remote: 'origin',
		integration: 'develop',
		queue: [{ number: 7, branch: CANDIDATE }],
	});

describe('branchesLandingAsTheyAre', () => {
	it('takes a candidate level with the integration branch as landing as it is', () => {
		const { owner } = project();
		expect([...landing(owner.root)]).toEqual([CANDIDATE]);
	});

	it('does not, once the integration branch moved in the same file, although this machine had not fetched', () => {
		const { owner, other } = project();
		writeFileSync(join(other.root, 'shared.ts'), 'export const a = 3;\n');
		other.git('commit', '-qam', 'fix: something else in the same file');
		other.git('push', '-q', 'origin', 'develop');
		// The owner machine's remote-tracking ref is still the old commit.
		expect(owner.git('rev-parse', 'origin/develop')).not.toBe(
			other.git('rev-parse', 'HEAD'),
		);

		expect([...landing(owner.root)]).toEqual([]);
		expect(owner.git('rev-parse', 'origin/develop')).toBe(
			other.git('rev-parse', 'HEAD'),
		);
	});
});
