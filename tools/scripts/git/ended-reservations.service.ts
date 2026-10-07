/**
 * ended-reservations.service.ts — a review reservation whose unit has
 * ended leaves the forge.
 *
 * A reviewer's reservation is a ref naming its unit. After a swarm's
 * agents finished, 25 of 43 named units that no longer existed, and
 * nothing removed them: the claim namespace filled with refs nobody held.
 * `reserveReview` already lets the next reviewer take one over; this
 * removes them, by the same rule (the unit is on the forge neither as a
 * work ref nor as a publication, and the reservation is older than the
 * grace a fresh unit needs to be pushed).
 */
import { execFileSync } from 'node:child_process';

import {
	REVIEW_RESERVATION_NAMESPACE,
	REVIEW_RESERVATION_UNIT_GRACE_SECONDS,
} from '../../../plugins/proposals/src/lib/contracts/constants/review-reservation.constant';

const git = (root: string, args: readonly string[]): string | undefined => {
	try {
		return execFileSync('git', [...args], {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return undefined;
	}
};

export interface IEndedReservation {
	readonly ref: string;
	readonly sha: string;
	readonly unit: string;
}

/** The reservations on `remote` whose unit has ended. */
export const endedReservations = (
	root: string,
	remote: string,
	now: number = Math.floor(Date.now() / 1000),
): readonly IEndedReservation[] => {
	const listed = git(root, [
		'ls-remote',
		'--',
		remote,
		`${REVIEW_RESERVATION_NAMESPACE}*`,
	]);
	if (listed === undefined || listed.length === 0) return [];
	const ended: IEndedReservation[] = [];
	for (const line of listed.split('\n')) {
		const [sha, ref] = line.split('\t');
		if (sha === undefined || ref === undefined) continue;
		if (git(root, ['cat-file', '-e', `${sha}^{commit}`]) === undefined) {
			git(root, [
				'fetch',
				'--quiet',
				'--no-write-fetch-head',
				'--',
				remote,
				sha,
			]);
		}
		const shown = git(root, ['log', '-1', '--format=%ct%n%B', sha]);
		if (shown === undefined) continue;
		const [stamp = '0', ...body] = shown.split('\n');
		if (now - Number(stamp) <= REVIEW_RESERVATION_UNIT_GRACE_SECONDS)
			continue;
		const text = body.join('\n');
		const unit = /^Unit: (.+)$/mu.exec(text)?.[1]?.trim() ?? '';
		const agent = /^Agent: (.+)$/mu.exec(text)?.[1]?.trim() ?? '';
		const at = unit.indexOf(`/${agent}/`);
		if (agent.length === 0 || at === -1) continue;
		const alive = git(root, [
			'ls-remote',
			'--',
			remote,
			unit.slice(at + 1),
		]);
		if (alive === undefined || alive.length > 0) continue;
		ended.push({ ref, sha, unit });
	}
	return ended;
};

/** Delete one ended reservation, only if it is still what was read. */
export const dropReservation = (
	root: string,
	remote: string,
	reservation: IEndedReservation,
): boolean =>
	git(root, [
		'-c',
		'core.hooksPath=/dev/null',
		'push',
		'--quiet',
		`--force-with-lease=${reservation.ref}:${reservation.sha}`,
		'--',
		remote,
		`:${reservation.ref}`,
	]) !== undefined;
