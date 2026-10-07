/**
 * review-reservation.spec.ts — of two reviewers claiming one proposal,
 * the forge lets one in, and a reviewer that went away keeps nothing.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	REVIEW_RESERVATION_SECONDS,
	REVIEW_RESERVATION_UNIT_GRACE_SECONDS,
} from '@delendai/proposals/lib/contracts/constants/review-reservation.constant';
import {
	claimForReview,
	releaseClaim,
} from '@delendai/proposals/lib/services/review-claim.service';
import { heldFromTrailers } from '@delendai/proposals/lib/services/review-claims.service';
import {
	releaseReview,
	reserveReview,
} from '@delendai/proposals/lib/services/review-reservation.service';
import { createGitRunner } from '@delendai/proposals/lib/shared/git-runner';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const shape = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
}).branches;

const UNIT = (agent: string, generation = 1): string =>
	`delendai/wip/${agent}/review/batch-all-g${String(generation)}/verdicts`;

/** A forge and two clones of it, each standing on its own review unit. */
const twoReviewers = () => {
	const base = mkdtempSync(join(tmpdir(), 'reservation-'));
	roots.push(base);
	const forge = join(base, 'origin.git');
	execFileSync('git', ['init', '-q', '--bare', '-b', 'develop', forge]);
	const clone = (name: string, unit: string) => {
		const root = join(base, name);
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
		execFileSync('git', ['clone', '-q', forge, root], { stdio: 'ignore' });
		git('config', 'user.email', `${name}@example.com`);
		git('config', 'user.name', name);
		git('config', 'commit.gpgsign', 'false');
		if (git('rev-parse', '--verify', '-q', 'origin/develop') === '') {
			git('switch', '-q', '-c', 'develop');
			writeFileSync(join(root, 'README.md'), '# project\n');
			git('add', '-A');
			git('commit', '-q', '-m', 'base');
			git('push', '-q', 'origin', 'develop');
		}
		git('switch', '-q', '-c', unit, 'origin/develop');
		return { root, git, run: createGitRunner(root) };
	};
	const seed = join(base, 'seed');
	execFileSync('git', ['init', '-q', '-b', 'develop', seed]);
	const seeded = (...args: string[]) =>
		execFileSync('git', args, { cwd: seed, encoding: 'utf8' });
	seeded('config', 'user.email', 's@example.com');
	seeded('config', 'user.name', 'S');
	seeded('config', 'commit.gpgsign', 'false');
	writeFileSync(join(seed, 'README.md'), '# project\n');
	seeded('add', '-A');
	seeded('commit', '-q', '-m', 'base');
	seeded('remote', 'add', 'origin', forge);
	seeded('push', '-q', 'origin', 'develop');
	return {
		first: clone('first', UNIT('agent-a')),
		second: clone('second', UNIT('agent-a', 2)),
	};
};

describe('claiming a proposal for review', () => {
	it('lets one of two units of the same model in, and names the holder to the other', async () => {
		const { first, second } = twoReviewers();

		const won = await claimForReview(
			first.run,
			shape,
			'x00001',
			'origin/develop',
		);
		const lost = await claimForReview(
			second.run,
			shape,
			'x00001',
			'origin/develop',
		);

		expect(won.kind).toBe('claimed');
		expect(lost).toEqual({ kind: 'held', by: ['agent-a'] });
		// The loser committed no claim of its own.
		expect(second.git('rev-list', '--count', 'origin/develop..HEAD')).toBe(
			'0',
		);
		// Another proposal is free.
		expect(
			(
				await claimForReview(
					second.run,
					shape,
					'x00002',
					'origin/develop',
				)
			).kind,
		).toBe('claimed');
	});
});

describe('a reservation', () => {
	const holder = (generation: number) => ({
		unit: UNIT('agent-a', generation),
		agent: 'agent-a',
	});

	it('is renewed by its holder and refused to anybody else while it holds', async () => {
		const { first, second } = twoReviewers();
		expect(await reserveReview(first.run, 'x00001', holder(1))).toEqual({
			kind: 'reserved',
		});
		expect(await reserveReview(first.run, 'x00001', holder(1))).toEqual({
			kind: 'reserved',
		});
		expect(await reserveReview(second.run, 'x00001', holder(2))).toEqual({
			kind: 'taken',
			unit: UNIT('agent-a'),
			agent: 'agent-a',
		});
	});

	it('passes to the next reviewer once its holder let it lapse, or gave it back', async () => {
		const { first, second } = twoReviewers();
		await reserveReview(first.run, 'x00001', holder(1));
		const later =
			Math.floor(Date.now() / 1000) + REVIEW_RESERVATION_SECONDS + 60;
		expect(
			await reserveReview(second.run, 'x00001', holder(2), later),
		).toEqual({ kind: 'reserved' });

		// Only its holder gives a reservation back.
		expect(await releaseReview(first.run, 'x00001', holder(1))).toBe(false);
		expect(await releaseReview(second.run, 'x00001', holder(2))).toBe(true);
		expect(await reserveReview(first.run, 'x00001', holder(1))).toEqual({
			kind: 'reserved',
		});
	});

	it('passes on once its unit has ended, and holds while its unit is on the forge', async () => {
		const afterGrace =
			Math.floor(Date.now() / 1000) +
			REVIEW_RESERVATION_UNIT_GRACE_SECONDS +
			60;
		// The holder's unit is on the forge: the reservation holds.
		const live = twoReviewers();
		live.first.git(
			'push',
			'-q',
			'origin',
			`HEAD:refs/heads/${UNIT('agent-a')}`,
		);
		await reserveReview(live.first.run, 'x00001', holder(1));
		expect(
			await reserveReview(
				live.second.run,
				'x00001',
				holder(2),
				afterGrace,
			),
		).toEqual({ kind: 'taken', unit: UNIT('agent-a'), agent: 'agent-a' });

		// Neither its work ref nor a publication is there any more: it has
		// ended, and the proposal is free long before the hours run out.
		const ended = twoReviewers();
		await reserveReview(ended.first.run, 'x00001', holder(1));
		expect(
			await reserveReview(
				ended.second.run,
				'x00001',
				holder(2),
				afterGrace,
			),
		).toEqual({ kind: 'reserved' });
	});

	it('is not asked for where there is no forge', async () => {
		const { first } = twoReviewers();
		first.git('remote', 'remove', 'origin');
		expect(await reserveReview(first.run, 'x00001', holder(1))).toEqual({
			kind: 'unavailable',
		});
	});
});

describe('giving a claim back', () => {
	it('reads the newest word about each proposal', () => {
		// Newest commit first: claims, a tab, releases.
		expect(
			heldFromTrailers(
				['x00002\t', '\tx00001', 'x00001\t', '\t'].join('\n'),
			),
		).toEqual(['x00002']);
		expect(heldFromTrailers('x00001\t\n\tx00001\nx00001\t')).toEqual([
			'x00001',
		]);
		expect(heldFromTrailers('')).toEqual([]);
	});

	it('frees the proposal for the next reviewer, and leaves room in the pack', async () => {
		const { first, second } = twoReviewers();
		await claimForReview(first.run, shape, 'x00001', 'origin/develop');
		expect(
			(
				await claimForReview(
					second.run,
					shape,
					'x00001',
					'origin/develop',
				)
			).kind,
		).toBe('held');

		const released = await releaseClaim(
			first.run,
			shape,
			'x00001',
			'origin/develop',
			'its gate needs a service I cannot start here',
		);
		expect(released.kind).toBe('released');
		expect(
			first.git(
				'log',
				'-1',
				'--format=%(trailers:key=Releases,valueonly)',
			),
		).toBe('x00001');

		expect(
			(
				await claimForReview(
					second.run,
					shape,
					'x00001',
					'origin/develop',
				)
			).kind,
		).toBe('claimed');
		// Nothing to give back twice, and nothing the unit never held.
		expect(
			(
				await releaseClaim(
					first.run,
					shape,
					'x00001',
					'origin/develop',
					'again',
				)
			).kind,
		).toBe('not-held');
	});
});
