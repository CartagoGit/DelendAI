import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ProposalsSqliteDriver } from '../../../../src/lib/sqlite-driver'
import { OutboxRepo } from '../../../../src/lib/repository/outbox-repo'

const makeTmpPath = (): { dir: string; path: string } => {
	const dir = mkdtempSync(join(tmpdir(), 'proposals-sqlite-outbox-'))
	return { dir, path: join(dir, 'proposals.sqlite') }
}

describe('OutboxRepo (q00022 S3 / f00514 S2)', () => {
	let tmpDir: string
	let dbPath: string

	beforeEach(() => {
		const tmp = makeTmpPath()
		tmpDir = tmp.dir
		dbPath = tmp.path
	})

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true })
	})

	it('dedupes enqueue by idempotency key', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath })
		try {
			const repo = new OutboxRepo(driver.handle)
			const first = repo.enqueue({
				idempotencyKey: 'idem-1',
				kind: 'regenerate-index',
				payload: '{}',
				now: 100,
			})
			const second = repo.enqueue({
				idempotencyKey: 'idem-1',
				kind: 'regenerate-index',
				payload: '{}',
				now: 101,
			})

			expect(first.kind).toBe('enqueued')
			expect(second.kind).toBe('already_enqueued')
			expect(second.record.id).toBe(first.record.id)
		} finally {
			driver.close()
		}
	})

	it('lists pending rows and advances them through in-flight and terminal states', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath })
		try {
			const repo = new OutboxRepo(driver.handle)
			const queued = repo.enqueue({
				idempotencyKey: 'idem-1',
				kind: 'regenerate-index',
				payload: '{}',
				nextAttemptAt: 100,
				now: 100,
			})
			const pending = repo.listPending(100)
			expect(pending).toHaveLength(1)
			expect(pending[0]?.id).toBe(queued.record.id)

			const inFlight = repo.markInFlight(queued.record.id, 120)
			expect(inFlight.status).toBe('in-flight')
			expect(inFlight.attempts).toBe(1)
			expect(repo.listPending(200)).toHaveLength(0)

			const failed = repo.markFailed({
				id: queued.record.id,
				lastError: 'temporary-failure',
				nextAttemptAt: 500,
				now: 200,
			})
			expect(failed.status).toBe('failed')
			expect(failed.lastError).toBe('temporary-failure')

			const done = repo.markDone(queued.record.id, 300)
			expect(done.status).toBe('done')
			expect(done.lastError).toBeNull()
		} finally {
			driver.close()
		}
	})
})