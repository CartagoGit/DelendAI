/**
 * queue-acceptance.spec.ts — the machine that brings candidates forward
 * judges them against the integration branch as it is now.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { testedInstant } from './candidate-tested-base';
import {
	branchesLandingAsTheyAre,
	queueAcceptance,
	trainRiders,
} from './queue-acceptance';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const CANDIDATE = 'delendai/pr/agent-a/implement/x00001-S1-g1/the-work';
const COMPANION = 'delendai/pr/agent-b/implement/x00002-S1-g1/the-other';

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

	it('brings forward a lone candidate behind in its own file, judged against the tip this machine had not fetched', () => {
		const { owner, other } = project();
		writeFileSync(join(other.root, 'shared.ts'), 'export const a = 3;\n');
		other.git('commit', '-qam', 'fix: something else in the same file');
		other.git('push', '-q', 'origin', 'develop');
		// The owner machine's remote-tracking ref is still the old commit.
		expect(owner.git('rev-parse', 'origin/develop')).not.toBe(
			other.git('rev-parse', 'HEAD'),
		);

		// It does not land as it is, and alone it rides no train of one:
		// it is brought forward here and runs its own checks.
		expect([...landing(owner.root)]).toEqual([]);
		const tip = other.git('rev-parse', 'HEAD');
		expect(owner.git('rev-parse', 'origin/develop')).toBe(tip);
		const candidates = [
			{
				number: 7,
				headRef: CANDIDATE,
				headSha: owner.git('rev-parse', `origin/${CANDIDATE}`),
			},
		];
		const input = {
			root: owner.root,
			remote: 'origin',
			integration: 'develop',
			integrationSha: tip,
			candidates,
			testedFrom: () => undefined,
		};
		expect(queueAcceptance(input)[0]?.accepted).toBe(false);
		expect(trainRiders(input)[0]?.accepted).toBe(true);
	});
});

describe('a train that cannot run (x01053 S4)', () => {
	const stalled = () => {
		const { owner, other } = project();
		writeFileSync(join(other.root, 'shared.ts'), 'export const a = 3;\n');
		other.git('commit', '-qam', 'fix: something else in the same file');
		other.git('push', '-q', 'origin', 'develop');
		return { owner, other };
	};
	// A train runs for two riders or more, so a second rider keeps the first
	// one on the train's side; a rider alone is brought forward whatever the
	// grace.
	const withCompanion = (owner: ReturnType<typeof project>['owner']) => {
		owner.git('switch', '-q', '-c', COMPANION, 'origin/develop~0');
		owner.git(
			'reset',
			'-q',
			'--hard',
			owner.git('merge-base', 'origin/develop', `origin/${CANDIDATE}`),
		);
		writeFileSync(
			join(owner.root, 'companion.ts'),
			'export const b = 1;\n',
		);
		owner.git('add', '-A');
		owner.git('commit', '-qm', 'feat: the other work');
		owner.git('push', '-q', 'origin', COMPANION);
		owner.git('switch', '-q', 'develop');
	};
	const landingWith = (root: string, now: number) =>
		branchesLandingAsTheyAre({
			root,
			remote: 'origin',
			integration: 'develop',
			queue: [
				{ number: 7, branch: CANDIDATE },
				{ number: 8, branch: COMPANION },
			],
			trainPrefixes: ['delendai/train/'],
			now,
		});
	const AFTER = Math.floor(Date.now() / 1000) + 3600;

	it('brings a behind rider forward when no train carries it, so it does not wait forever', () => {
		const { owner } = stalled();
		withCompanion(owner);
		expect([...landingWith(owner.root, AFTER)]).toEqual([]);
	});

	it('leaves the rider to the train while the tip is within the grace', () => {
		const { owner } = stalled();
		withCompanion(owner);
		expect([
			...landingWith(owner.root, Math.floor(Date.now() / 1000)),
		]).toContain(CANDIDATE);
	});

	const tipPrefix = (owner: ReturnType<typeof project>['owner']) =>
		owner.git('rev-parse', 'origin/develop').slice(0, 12);
	const pushRef = (
		owner: ReturnType<typeof project>['owner'],
		sha: string,
		name: string,
	) => owner.git('push', '-q', 'origin', `${sha}:refs/heads/${name}`);

	it('leaves a rider to the train that carries it, however long the tip has stood', () => {
		const { owner } = stalled();
		withCompanion(owner);
		owner.git('fetch', '-q', 'origin');
		pushRef(
			owner,
			owner.git('rev-parse', `origin/${CANDIDATE}`),
			`delendai/train/${tipPrefix(owner)}/7-8`,
		);
		expect([...landingWith(owner.root, AFTER)]).toContain(CANDIDATE);
	});

	it('does not count a train left from an older tip as carrying the rider', () => {
		const { owner } = stalled();
		withCompanion(owner);
		owner.git('fetch', '-q', 'origin');
		pushRef(
			owner,
			owner.git('rev-parse', `origin/${CANDIDATE}`),
			'delendai/train/000000000000/7-8',
		);
		expect([...landingWith(owner.root, AFTER)]).not.toContain(CANDIDATE);
	});

	it('does not leave a rider the queue isolated as a culprit to a train', () => {
		const { owner } = stalled();
		withCompanion(owner);
		owner.git('fetch', '-q', 'origin');
		const head = owner.git('rev-parse', `origin/${CANDIDATE}`);
		pushRef(owner, head, `delendai/train/${tipPrefix(owner)}/7-8`);
		pushRef(owner, head, 'delendai/train/culprit/7');
		const left = [
			...landingWith(owner.root, Math.floor(Date.now() / 1000)),
		];
		expect(left).not.toContain(CANDIDATE);
	});
});

describe('a candidate whose checks already saw the integration branch', () => {
	const moved = () => {
		const { owner, other } = project();
		writeFileSync(join(other.root, 'shared.ts'), 'export const a = 3;\n');
		other.git('commit', '-qam', 'feat: the integration branch moves');
		other.git('push', '-q', 'origin', 'develop');
		owner.git('fetch', '-q', 'origin');
		const tip = owner.git('rev-parse', 'origin/develop');
		const head = owner.git('rev-parse', `origin/${CANDIDATE}`);
		const judge = (
			testedFrom: (sha: string, base: string) => string | undefined,
		) =>
			queueAcceptance({
				root: owner.root,
				remote: 'origin',
				integration: 'develop',
				integrationSha: tip,
				candidates: [{ number: 7, headRef: CANDIDATE, headSha: head }],
				testedFrom,
			})[0]?.accepted;
		return { judge, tip };
	};

	it('lands when its run saw the tip it would otherwise come forward to', () => {
		const { judge, tip } = moved();
		expect(judge(() => tip)).toBe(true);
	});

	it('counts from where it left when nobody can say what its run saw', () => {
		const { judge } = moved();
		expect(judge(() => undefined)).toBe(false);
	});

	it('still comes forward for what landed after its run', () => {
		const { judge } = moved();
		expect(judge((_sha, base) => base)).toBe(false);
	});
});

describe('testedInstant', () => {
	it('reads the branch before the run, for the merge ref built ahead of it', () => {
		expect(testedInstant('2026-11-01T00:10:00Z')).toBe(
			'2026-11-01T00:08:00.000Z',
		);
		expect(testedInstant('not a date')).toBeUndefined();
	});
});
