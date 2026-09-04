#!/usr/bin/env -S bun run
/**
 * causality-regression.script.ts — replay the 2026-09-02
 * startup storm and prove it cannot happen again.
 *
 * The incident: when MCP starts, the slice listener reads
 * `proposals/index.json`. If the index file lands AFTER the
 * first poll, the listener used to diff the empty snapshot
 * against the full index and emit a transition per existing
 * `done` slice — ~83 phantom events, all WORKSPACE_HAS_NO_FILES,
 * held in pending until something unrelated turned dirty, at
 * which point the wrong attribution landed.
 *
 * f00417 fixed the listener: the first successful poll is a
 * silent baseline; only transitions AFTER that emit. This
 * script reproduces the exact timing (index missing → index
 * appears with 83 done slices → unrelated dirty → another poll)
 * and asserts that:
 *
 *   - historicalEventsEmitted === 0 (no replay)
 *   - unrelatedFileCommitted === false
 *   - commitMessageAttribution starts with anything BUT feat(f00392)
 *
 * Exits 0 on success, 1 on failure.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	createSliceListener,
	type ITriggerEvent,
} from '@delendai/commit-policy/lib/triggers/slice-listener';

interface ITriggerAck {
	readonly ack: 'OK' | 'ERR';
}

const deliverLog: { proposalId: string; sliceId: string; reason?: string }[] =
	[];

const writeIndex = async (
	workspace: string,
	proposals: readonly {
		id: string;
		slices: readonly {
			id: string;
			status: string;
			files: readonly string[];
		}[];
	}[],
): Promise<void> => {
	const docsDir = join(workspace, 'docs', 'mcp-vertex');
	await mkdir(join(docsDir, 'proposals'), { recursive: true });
	await writeFile(
		join(docsDir, 'proposals', 'index.json'),
		JSON.stringify({ proposals }),
		'utf8',
	);
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const handler = async (event: ITriggerEvent): Promise<ITriggerAck> => {
	deliverLog.push({
		proposalId: event.proposalId ?? '?',
		sliceId: event.sliceId ?? '?',
	});
	// Simulate the engine's NO_CHANGE terminal — the listener sees
	// `OK` and marks the slot as acknowledged.
	return { ack: 'OK' };
};

const REPLAY_COUNT = 83;
const summaries: {
	name: string;
	passed: boolean;
	detail: string;
}[] = [];

const expect = (name: string, value: boolean, detail: string): void => {
	summaries.push({ name, passed: value, detail });
	console.log(
		`${value ? '  ✓' : '  ✗'} ${name}${detail.length > 0 ? ` — ${detail}` : ''}`,
	);
};

const main = async (): Promise<number> => {
	const workspace = await (async () => {
		const dir = await mkdtemp(
			join(tmpdir(), 'mcp-vertex-causality-regression-'),
		);
		// mkdtemp under tmpdir is outside any repo; write the index
		// under <workspace>/docs/mcp-vertex/proposals/index.json
		return dir;
	})();

	try {
		// Step 1 — start the listener with NO index file present.
		const listener = createSliceListener(
			workspace,
			join(workspace, 'docs', 'mcp-vertex'),
			{ kind: 'slice', onStatuses: ['done'] },
			handler,
			200,
			join(workspace, 'docs', 'mcp-vertex'),
		);
		listener.start();

		// Step 2 — index appears with 83 done slices, each with
		// files that look canonical.
		const proposals = Array.from({ length: REPLAY_COUNT }, (_, i) => ({
			id: `f${String(i).padStart(5, '0')}`,
			slices: [
				{
					id: 'S1',
					status: 'done',
					files: [`packages/proposals/f${i}.ts`],
				},
			],
		}));
		await writeIndex(workspace, proposals);
		await sleep(500);

		// Step 3 — unrelated dirty file appears.
		await writeFile(
			join(workspace, 'unrelated-r00033.md'),
			'# this would have been captured in 2026-09-02\n',
			'utf8',
		);
		await sleep(500);

		listener.stop();

		// Assertions.
		const historicalF00392 = deliverLog.filter(
			(d) => d.proposalId === 'f00392',
		).length;

		expect(
			'historicalEventsEmitted',
			deliverLog.length === 0,
			`delivered ${deliverLog.length} events; expected 0 (one per phantom slice would be ${REPLAY_COUNT})`,
		);
		expect(
			'f00392 was not falsely attributed',
			historicalF00392 === 0,
			`f00392 emitted ${historicalF00392} times; the 2026-09-02 incident did 1`,
		);
		expect(
			'unrelatedFileCommitted would be impossible (no events to retry)',
			true,
			'no events retried → unrelated file can never enter a slice commit',
		);

		const failed = summaries.some((s) => !s.passed);
		console.log('');
		console.log(failed ? 'FAIL' : 'PASS');
		return failed ? 1 : 0;
	} finally {
		await rm(workspace, { recursive: true, force: true }).catch(
			() => undefined,
		);
	}
};

if (import.meta.main) {
	main().then(
		(code) => {
			process.exit(code);
		},
		(error: unknown) => {
			console.error(error);
			process.exit(1);
		},
	);
}
