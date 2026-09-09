/**
 * close-race.spec.ts — the guarantee this schema exists to keep.
 *
 *     N concurrent closes → EXACTLY ONE `closed`,
 *                           N-1 `already_closed`,
 *                           NEVER zero.
 *
 * The known bug class in this codebase is a close implemented as
 * read-decide-write, where two callers both read "open" and the second
 * write is either lost or aborts, so nobody can honestly say the close
 * happened. `WorkUnitsRepo.close` instead puts the precondition in the
 * WHERE clause of a single UPDATE and reads the verdict from `changes`.
 *
 * This spec runs REAL processes against ONE database file, released
 * simultaneously by a wall-clock barrier. There is no retry anywhere in
 * the test: if the implementation could lose a race, this would fail
 * rather than be papered over.
 */
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { WorkUnitsRepo } from '../../../../src/lib/work-model/work-units-repo';
import {
	makeFixture,
	ProposalsSqliteDriver,
	seedIdentity,
	TEST_REPOSITORY,
} from './fixture';

const WORKER = fileURLToPath(new URL('./close-worker.ts', import.meta.url));
const ATTEMPTS = 8;

describe('concurrent close of a work unit', () => {
	it('produces exactly one winner across real processes', async () => {
		const fixture = makeFixture('close-race');
		const setup = new ProposalsSqliteDriver({ path: fixture.dbPath });
		let uid = '';
		try {
			const identity = seedIdentity(setup);
			uid = new WorkUnitsRepo(setup.handle).ensure({
				repositoryId: identity.repositoryId,
				repository: TEST_REPOSITORY,
				proposalUid: 'f00777',
				sliceUid: 'f00777-s1',
				createdByAgentId: identity.agentId,
				state: 'integrating',
				now: 1_000,
			}).uid;
		} finally {
			setup.close();
		}

		const startAt = Date.now() + 1_500;
		const outcomes = await Promise.all(
			Array.from({ length: ATTEMPTS }, async () => {
				const proc = Bun.spawn({
					cmd: [
						'bun',
						WORKER,
						fixture.dbPath,
						uid,
						String(startAt),
					],
					stdout: 'pipe',
					stderr: 'pipe',
				});
				const [stdout, stderr, exitCode] = await Promise.all([
					new Response(proc.stdout).text(),
					new Response(proc.stderr).text(),
					proc.exited,
				]);
				if (exitCode !== 0) {
					throw new Error(`close worker failed: ${stderr}`);
				}
				return (
					JSON.parse(stdout.trim()) as { readonly kind: string }
				).kind;
			}),
		);

		const closed = outcomes.filter((kind) => kind === 'closed');
		const already = outcomes.filter((kind) => kind === 'already_closed');

		expect(closed).toHaveLength(1);
		expect(already).toHaveLength(ATTEMPTS - 1);
		expect(closed.length + already.length).toBe(ATTEMPTS);

		const verify = new ProposalsSqliteDriver({ path: fixture.dbPath });
		try {
			const row = new WorkUnitsRepo(verify.handle).getByUid(uid);
			expect(row?.state).toBe('integrated');
			expect(row?.closedAt).not.toBeNull();
			// The revision moved exactly once: the losers wrote nothing.
			expect(row?.revision).toBe(1);
		} finally {
			verify.close();
			rmSync(fixture.dir, { recursive: true, force: true });
		}
	}, 60_000);
});
