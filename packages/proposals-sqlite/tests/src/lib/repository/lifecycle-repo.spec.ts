import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ProposalsSqliteDriver } from '../../../../src/lib/sqlite-driver'
import { LifecycleRepo } from '../../../../src/lib/repository/lifecycle-repo'

const makeTmpPath = (): { dir: string; path: string } => {
	const dir = mkdtempSync(join(tmpdir(), 'proposals-sqlite-lifecycle-'))
	return { dir, path: join(dir, 'proposals.sqlite') }
}

describe('LifecycleRepo (q00022 S3 / f00514 S1)', () => {
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

	it('appends lifecycle rows and lists them in occurrence order', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath })
		try {
			const repo = new LifecycleRepo(driver.handle)
			repo.append({
				entityType: 'proposal',
				entityUid: 'x00512',
				entityRevision: 1,
				toStatus: 'ready',
				actor: 'agent-a',
				source: 'unit-test',
				occurredAt: 100,
			})
			repo.append({
				entityType: 'proposal',
				entityUid: 'x00512',
				entityRevision: 2,
				fromStatus: 'ready',
				toStatus: 'done',
				actor: 'agent-a',
				source: 'unit-test',
				metadata: '{"reason":"closed"}',
				occurredAt: 200,
			})

			const rows = repo.listForEntity({
				entityType: 'proposal',
				entityUid: 'x00512',
			})

			expect(rows.map((row) => row.entityRevision)).toEqual([1, 2])
			expect(rows[1]?.metadata).toBe('{"reason":"closed"}')
			expect(rows[1]?.toStatus).toBe('done')
		} finally {
			driver.close()
		}
	})
})