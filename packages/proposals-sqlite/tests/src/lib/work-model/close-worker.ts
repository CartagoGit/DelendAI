/**
 * close-worker.ts — one OS process attempting to close a work unit.
 *
 * WHY a separate process: `bun:sqlite` is synchronous, so N "concurrent"
 * closes inside one process are just N sequential closes and prove
 * nothing. Real contention needs real processes contending for the same
 * database file, which is what the concurrency spec spawns.
 *
 * All workers busy-wait until a shared wall-clock instant so their
 * writes actually overlap, then print one JSON line with the outcome.
 */
import { ProposalsSqliteDriver } from '../../../../src/lib/sqlite-driver';
import { WorkUnitsRepo } from '../../../../src/lib/work-model/work-units-repo';

const [dbPath, uid, startAtRaw] = process.argv.slice(2);
if (!dbPath || !uid || !startAtRaw) {
	throw new Error(
		'usage: close-worker <dbPath> <workUnitUid> <startAtEpochMs>',
	);
}

const startAt = Number.parseInt(startAtRaw, 10);
const driver = new ProposalsSqliteDriver({ path: dbPath });
try {
	// Spin rather than sleep: a timer would let the OS scheduler stagger
	// the wake-ups, which is exactly the overlap we are trying to force.
	while (Date.now() < startAt) {
		/* barrier */
	}
	const outcome = new WorkUnitsRepo(driver.handle).close({ uid });
	process.stdout.write(`${JSON.stringify({ kind: outcome.kind })}\n`);
} finally {
	driver.close();
}
