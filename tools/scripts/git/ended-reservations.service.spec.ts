/**
 * ended-reservations.service.spec.ts — a reservation whose unit has ended
 * is found and dropped; one whose unit lives is left.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { REVIEW_RESERVATION_UNIT_GRACE_SECONDS } from '../../../plugins/proposals/src/lib/contracts/constants/review-reservation.constant';
import {
	dropReservation,
	endedReservations,
} from './ended-reservations.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A clone of a bare forge holding two reservations: one live, one ended. */
const forge = () => {
	const base = mkdtempSync(join(tmpdir(), 'ended-reservations-'));
	roots.push(base);
	const remote = join(base, 'origin.git');
	const root = join(base, 'clone');
	git(base, 'init', '-q', '--bare', remote);
	git(base, 'init', '-q', root);
	git(root, 'config', 'user.email', 'r@example.com');
	git(root, 'config', 'user.name', 'R');
	writeFileSync(join(root, 'README.md'), '# project\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', remote);
	const reserve = (id: string, agent: string) => {
		const unit = `refs/heads/delendai/wip/${agent}/review/batch-all-g1/verdicts`;
		const commit = git(
			root,
			'commit-tree',
			'HEAD^{tree}',
			'-m',
			`review claim ${id} u\n\nUnit: ${unit}\nAgent: ${agent}`,
		);
		git(
			root,
			'push',
			'-q',
			'origin',
			`${commit}:refs/delendai/claims/review/${id}`,
		);
		return unit;
	};
	const liveUnit = reserve('x00001', 'agent-live');
	git(root, 'push', '-q', 'origin', `HEAD:${liveUnit}`);
	reserve('x00002', 'agent-gone');
	return { root };
};

describe('ended reservations', () => {
	const later = () =>
		Math.floor(Date.now() / 1000) +
		REVIEW_RESERVATION_UNIT_GRACE_SECONDS +
		60;

	it('are the ones whose unit is on the forge neither as a work ref nor as a publication', () => {
		const { root } = forge();
		expect(
			endedReservations(root, 'origin', later()).map((each) => each.ref),
		).toEqual(['refs/delendai/claims/review/x00002']);
		// A fresh reservation is given the time its unit needs to be pushed.
		expect(endedReservations(root, 'origin')).toEqual([]);
	});

	it('are dropped from the forge, and the live one stays', () => {
		const { root } = forge();
		for (const reservation of endedReservations(root, 'origin', later())) {
			expect(dropReservation(root, 'origin', reservation)).toBe(true);
		}
		expect(
			git(root, 'ls-remote', 'origin', 'refs/delendai/claims/review/*'),
		).toContain('x00001');
		expect(
			git(root, 'ls-remote', 'origin', 'refs/delendai/claims/review/*'),
		).not.toContain('x00002');
	});
});
