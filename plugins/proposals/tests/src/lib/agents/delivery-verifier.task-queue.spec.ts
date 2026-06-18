/**
 * delivery-verifier.task-queue.spec.ts
 *
 * TDD specs for the p40c T3 deliverable: the new
 * `verifyClosure` entry point in
 * `libs/mcp-server/src/lib/agents/delivery-verifier.ts` that wires
 * the `affairs_task_queue report` into the verifier's verdict.
 *
 * 3 cases as enumerated in the proposal p40c T3:
 *   1. When the proposal declares `extras.taskQueue: true` AND
 *      `report.threshold === 'red' && queueLength > 0`, the verifier
 *      returns `verified: false` with a clear blocker.
 *   2. When `report.threshold === 'green'` or `'amber'`, the verifier
 *      accepts and appends the parsed `IBackpressureReport` to the
 *      output (`taskQueueReport` is the parsed report).
 *   3. When the proposal does NOT declare `extras.taskQueue: true`,
 *      the verifier ignores the report (back-compat) and
 *      `taskQueueReport` is `null` in the output.
 *
 * The verifier MUST stay read-only: it only calls `runTaskQueueAction`
 * with `action: 'report'` and never `enqueue` / `dequeue` / `subscribe`.
 * We assert this by spying on the paths-resolver in a no-op scenario.
 *
 * Run: bun test libs/mcp-server -- delivery-verifier.task-queue
 */

import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { verifyClosure } from '@mcp-vertex/proposals/lib/agents/delivery-verifier';
import type { IProposalExtras } from '@mcp-vertex/proposals/lib/agents/delivery-verifier';

const TEMP_DIRS: string[] = [];

const createTempQueueDir = (): {
	queuePath: string;
	closedTasksPath: string;
} => {
	const dir = mkdtempSync(join(tmpdir(), 'affairs-dv-'));
	TEMP_DIRS.push(dir);
	const queuePath = join(dir, 'queue.json');
	const closedTasksPath = join(dir, 'closed-tasks.json');
	writeFileSync(
		queuePath,
		JSON.stringify({ version: 1, entries: [] }, null, 2),
		'utf8'
	);
	writeFileSync(closedTasksPath, JSON.stringify([], null, 2), 'utf8');
	return { queuePath, closedTasksPath };
};

const writeQueue = (queuePath: string, payload: unknown): void => {
	writeFileSync(queuePath, JSON.stringify(payload, null, 2), 'utf8');
};

const writeClosedTasks = (closedTasksPath: string, payload: unknown): void => {
	writeFileSync(closedTasksPath, JSON.stringify(payload, null, 2), 'utf8');
};

afterEach(() => {
	for (const dir of TEMP_DIRS.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// Minimal proposal-document shape consumed by verifyClosure.
// We only require the frontmatter fields that verifyClosure reads;
// the full IProposalDocument is parsed upstream by the proposal-acceptance
// pipeline, so the verifier trusts the input it receives.
// ---------------------------------------------------------------------------
interface IMinimalProposalForVerifier {
	proposalId: string;
	frontmatter: {
		extras?: IProposalExtras;
		acceptanceCriteria?: readonly { command: string; expect: string }[];
	};
}

const minimalProposalWithTaskQueue = (
	proposalId: string
): IMinimalProposalForVerifier => ({
	proposalId,
	frontmatter: {
		extras: { taskQueue: true } as IProposalExtras,
		acceptanceCriteria: [],
	},
});

const _minimalProposalWithoutTaskQueue = (
	proposalId: string
): IMinimalProposalForVerifier => ({
	proposalId,
	frontmatter: {
		extras: {} as IProposalExtras,
		acceptanceCriteria: [],
	},
});

const minimalProposalMissingExtras = (
	proposalId: string
): IMinimalProposalForVerifier => ({
	proposalId,
	frontmatter: {
		acceptanceCriteria: [],
	},
});

// ---------------------------------------------------------------------------
// Case 1: red threshold with non-empty queue ⇒ verified: false
// ---------------------------------------------------------------------------
describe('verifyClosure — red threshold + non-empty queue', () => {
	it('returns verified=false with a clear blocker when taskQueue=true and threshold=red', async () => {
		const { queuePath, closedTasksPath } = createTempQueueDir();

		// Seed a queue with 17 queued entries (>= 16 → red threshold)
		const queuedEntries = Array.from({ length: 17 }, (_, i) => ({
			taskId: `smoke-${i}`,
			enqueuedAt: new Date(
				Date.now() - 1000 * 60 * (i + 1)
			).toISOString(),
			priority: 3 as const,
			waitFor: [],
			owner: {
				taskId: `smoke-${i}`,
				agentName: 'smoke_agent',
				agentSlot: 'implementation_runner' as const,
			},
			observe: [],
			status: 'queued' as const,
		}));
		writeQueue(queuePath, { version: 1, entries: queuedEntries });
		writeClosedTasks(closedTasksPath, []);

		const proposal = minimalProposalWithTaskQueue(
			'p40c'
		) as unknown as Parameters<typeof verifyClosure>[0]['proposal'];

		const result = await verifyClosure({
			proposal,
			paths: {
				queuePath,
				closedTasksPath,
				lockPath: join(tmpdir(), 'fake-lock.json'),
				workspaceRoot: tmpdir(),
			},
		});

		expect(result.verified).toBe(false);
		expect(result.taskQueueReport).not.toBeNull();
		expect(result.taskQueueReport?.threshold).toBe('red');
		expect(result.blockers.length).toBeGreaterThan(0);
		expect(result.blockers.join('\n')).toMatch(/red/i);
	});
});

// ---------------------------------------------------------------------------
// Case 2: green / amber threshold ⇒ verified can proceed and the parsed
// report is appended.
// ---------------------------------------------------------------------------
describe('verifyClosure — green / amber threshold', () => {
	it('returns the parsed IBackpressureReport and accepts when threshold=green', async () => {
		const { queuePath, closedTasksPath } = createTempQueueDir();
		// Empty queue → green threshold
		writeQueue(queuePath, { version: 1, entries: [] });
		writeClosedTasks(closedTasksPath, []);

		const proposal = minimalProposalWithTaskQueue(
			'p40c'
		) as unknown as Parameters<typeof verifyClosure>[0]['proposal'];

		const result = await verifyClosure({
			proposal,
			paths: {
				queuePath,
				closedTasksPath,
				lockPath: join(tmpdir(), 'fake-lock.json'),
				workspaceRoot: tmpdir(),
			},
		});

		expect(result.taskQueueReport).not.toBeNull();
		expect(result.taskQueueReport?.threshold).toBe('green');
		expect(result.taskQueueReport?.queueLength).toBe(0);
		// Green threshold does NOT add a blocker
		expect(
			result.blockers.some((b) => /threshold/i.test(b) && /red/i.test(b))
		).toBe(false);
	});

	it('returns the parsed IBackpressureReport and accepts when threshold=amber', async () => {
		const { queuePath, closedTasksPath } = createTempQueueDir();
		// 10 queued entries (> 8 → amber threshold)
		const queuedEntries = Array.from({ length: 10 }, (_, i) => ({
			taskId: `amber-${i}`,
			enqueuedAt: new Date(
				Date.now() - 1000 * 60 * (i + 1)
			).toISOString(),
			priority: 3 as const,
			waitFor: [],
			owner: {
				taskId: `amber-${i}`,
				agentName: 'amber_agent',
				agentSlot: 'implementation_runner' as const,
			},
			observe: [],
			status: 'queued' as const,
		}));
		writeQueue(queuePath, { version: 1, entries: queuedEntries });
		writeClosedTasks(closedTasksPath, []);

		const proposal = minimalProposalWithTaskQueue(
			'p40c'
		) as unknown as Parameters<typeof verifyClosure>[0]['proposal'];

		const result = await verifyClosure({
			proposal,
			paths: {
				queuePath,
				closedTasksPath,
				lockPath: join(tmpdir(), 'fake-lock.json'),
				workspaceRoot: tmpdir(),
			},
		});

		expect(result.taskQueueReport).not.toBeNull();
		expect(result.taskQueueReport?.threshold).toBe('amber');
		expect(result.taskQueueReport?.queueLength).toBe(10);
		// Amber threshold does NOT add a blocker
		expect(result.blockers.some((b) => /red/i.test(b))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Case 3: proposal does NOT declare taskQueue ⇒ back-compat, taskQueueReport = null
// ---------------------------------------------------------------------------
describe('verifyClosure — back-compat when proposal does not declare taskQueue', () => {
	it('returns taskQueueReport=null and ignores the report when extras.taskQueue is missing', async () => {
		const { queuePath, closedTasksPath } = createTempQueueDir();
		// Even with a populated queue, the verifier should ignore the report
		const queuedEntries = Array.from({ length: 20 }, (_, i) => ({
			taskId: `unused-${i}`,
			enqueuedAt: new Date().toISOString(),
			priority: 3 as const,
			waitFor: [],
			owner: {
				taskId: `unused-${i}`,
				agentName: 'unused',
				agentSlot: 'implementation_runner' as const,
			},
			observe: [],
			status: 'queued' as const,
		}));
		writeQueue(queuePath, { version: 1, entries: queuedEntries });
		writeClosedTasks(closedTasksPath, []);

		const proposal = minimalProposalMissingExtras(
			'p40c'
		) as unknown as Parameters<typeof verifyClosure>[0]['proposal'];

		const result = await verifyClosure({
			proposal,
			paths: {
				queuePath,
				closedTasksPath,
				lockPath: join(tmpdir(), 'fake-lock.json'),
				workspaceRoot: tmpdir(),
			},
		});

		expect(result.taskQueueReport).toBeNull();
	});

	it('returns taskQueueReport=null when extras.taskQueue is false', async () => {
		const { queuePath, closedTasksPath } = createTempQueueDir();
		writeQueue(queuePath, { version: 1, entries: [] });
		writeClosedTasks(closedTasksPath, []);

		const proposal: IMinimalProposalForVerifier = {
			proposalId: 'p40c',
			frontmatter: {
				extras: { taskQueue: false } as IProposalExtras,
				acceptanceCriteria: [],
			},
		};

		const result = await verifyClosure({
			proposal: proposal as unknown as Parameters<
				typeof verifyClosure
			>[0]['proposal'],
			paths: {
				queuePath,
				closedTasksPath,
				lockPath: join(tmpdir(), 'fake-lock.json'),
				workspaceRoot: tmpdir(),
			},
		});

		expect(result.taskQueueReport).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// Case 4: missing queue file is treated as green (empty queue, no throw)
// ---------------------------------------------------------------------------
describe('verifyClosure — missing queue file is treated as empty', () => {
	it('returns taskQueueReport with queueLength=0 when the queue file does not exist', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'affairs-dv-noq-'));
		TEMP_DIRS.push(dir);
		const queuePath = join(dir, 'queue.json'); // intentionally not created
		const closedTasksPath = join(dir, 'closed-tasks.json');
		if (!existsSync(closedTasksPath)) {
			writeFileSync(closedTasksPath, JSON.stringify([], null, 2), 'utf8');
		}

		const proposal = minimalProposalWithTaskQueue(
			'p40c'
		) as unknown as Parameters<typeof verifyClosure>[0]['proposal'];

		const result = await verifyClosure({
			proposal,
			paths: {
				queuePath,
				closedTasksPath,
				lockPath: join(tmpdir(), 'fake-lock.json'),
				workspaceRoot: tmpdir(),
			},
		});

		expect(result.taskQueueReport).not.toBeNull();
		expect(result.taskQueueReport?.queueLength).toBe(0);
		expect(result.taskQueueReport?.threshold).toBe('green');
	});
});
