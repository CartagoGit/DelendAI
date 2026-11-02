/**
 * server-log-reader.spec.ts — q00014 S3's missing gate.
 *
 * The reader and the diagnosis shipped without a spec, which is the
 * wrong way round for this module in particular: its whole value is
 * that it reads logs from hosts nobody here has seen, and the only way
 * to know it still does is to hand it the shapes that actually occur.
 *
 * The fixtures are the real 2026-09-02/03 incidents, rewritten with
 * synthetic paths and ids — the five bugs a person found by reading a
 * pasted VS Code log by hand:
 *
 *   - `console.info` corrupting the JSON-RPC channel,
 *   - a twelve-hour push retry loop,
 *   - a `.mutex` file breaking `git add`'s pathspec,
 *   - a plugin that failed to register,
 *   - a log storm where one line repeated per slice.
 *
 * Two properties matter as much as the classifications and are asserted
 * on their own: an unknown host's framing must not stop the read, and
 * nothing that leaves this module may carry a line's bytes.
 */
import { describe, expect, it } from 'vitest';

import {
	maskLogPayload,
	readServerLog,
	splitLogLines,
} from '../../../../src/lib/intake/server-log-reader.helper';
import { diagnoseServerLog } from '../../../../src/lib/intake/log-diagnosis.helper';

/** VS Code: ISO stamp, bracketed level, `[server stderr]` channel. */
const vscode = (payload: string, at = '2026-09-02 01:48:00.665') =>
	`${at} [error] [server stderr] ${payload}`;

/** A raw capture: no host framing at all. */
const bare = (payload: string) => payload;

describe('reading a host log nobody wrote this parser for', () => {
	it('classifies the five incidents a person had to find by hand', async () => {
		const read = await readServerLog([
			vscode(
				'Failed to parse message: Unexpected token < in JSON at position 0',
			),
			vscode(
				'[push-scheduler] push failed (interval): ! [rejected] develop -> develop (non-fast-forward)',
			),
			vscode(
				"fatal: pathspec '.cache/delendai/results/logs/2026-09-02.jsonl.mutex' did not match any files",
			),
			vscode(
				'plugin "proposals" register() failed: cannot read properties of undefined',
			),
			bare(
				'{"event":"slice-close","outcome":"ERR","code":"SLICE_NOT_CLAIMED","trigger":"close"}',
			),
		]);

		expect(read.events.map((event) => event.kind)).toEqual([
			'protocol-corruption',
			'push-failure',
			'pathspec-failure',
			'plugin-load-failure',
			'refusal',
		]);
		expect(read.events[4]?.code).toBe('SLICE_NOT_CLAIMED');
		expect(read.events[4]?.trigger).toBe('close');
		expect(read.linesRead).toBe(5);
		expect(read.truncated).toBe(false);
	});

	it("keeps the server's own bracketed tags and drops only host channels", async () => {
		// `[push-scheduler]` is the server talking; peeling it would take
		// the marker the classifier reads with it.
		const read = await readServerLog([
			vscode(
				'[push-scheduler] push failed (interval): stopped pushing automatically',
			),
		]);

		expect(read.events[0]?.kind).toBe('push-failure');
		expect(read.events[0]?.detail).toContain('push-scheduler');
	});

	it('skips what it cannot recognise instead of failing the read', async () => {
		// A parser that throws on line 4 of 40 000 is worth less than no
		// parser: the point is to salvage whatever an unknown host gives.
		const read = await readServerLog([
			'???? not a log line at all',
			'',
			'   ',
			'{"event":"heartbeat","outcome":"OK"}',
			vscode('Failed to parse message: Unexpected end of JSON input'),
		]);

		expect(read.events).toHaveLength(1);
		expect(read.events[0]?.kind).toBe('protocol-corruption');
		expect(read.linesRead).toBe(5);
		// Blank lines and lines that carry no recognised marker are both
		// skipped: `linesRead` counts what was looked at, `linesSkipped`
		// what produced nothing, and the difference is the evidence.
		expect(read.linesSkipped).toBe(4);
	});

	it('counts repetition by shape, not by bytes', async () => {
		const lines = Array.from({ length: 12 }, (_, index) =>
			bare(
				`[delendai] wrote /home/someone/project/.cache/delendai/results/run-${index}.json in ${index * 7}ms`,
			),
		);
		const read = await readServerLog(lines);

		// Twelve different lines, one shape: the ids, paths and durations
		// are exactly what the mask removes.
		const shape = read.shapes.find((each) => each.count === 12);
		expect(shape).toBeDefined();
		expect(read.shapes).toHaveLength(1);
	});

	it('stops at its own bounds and says so', async () => {
		const read = await readServerLog(
			Array.from({ length: 50 }, () =>
				bare('{"event":"tick","outcome":"OK"}'),
			),
			{ maxLines: 10 },
		);

		expect(read.linesRead).toBe(10);
		expect(read.truncated).toBe(true);
	});
});

describe('masking, which is what makes a shape safe to carry', () => {
	it('removes every part of a line that identifies a machine or a run', () => {
		const masked = maskLogPayload(
			'wrote /home/ada/projects/widgets/.cache/x.json (sha 4f1c0aa9b3e2) in 1274ms for "ada@example.com"',
		);

		expect(masked).not.toContain('/home/ada');
		expect(masked).not.toContain('4f1c0aa9b3e2');
		expect(masked).not.toContain('1274');
		expect(masked).not.toContain('ada@example.com');
	});

	it('gives two occurrences of one line the same shape', async () => {
		const read = await readServerLog([
			bare('[delendai] refused PUSH_BLOCKED after 3 attempts on /a/b/c'),
			bare('[delendai] refused PUSH_BLOCKED after 41 attempts on /d/e/f'),
		]);

		expect(new Set(read.events.map((event) => event.shapeId)).size).toBe(1);
	});
});

describe('splitting a pasted log', () => {
	it('handles both line endings and drops the trailing blank', () => {
		// CRLF is the common case, not the exotic one: this log is most
		// often pasted out of VS Code on Windows.
		expect([...splitLogLines('a\r\nb\nc\n')]).toEqual(['a', 'b', 'c']);
		expect([...splitLogLines('only one line')]).toEqual(['only one line']);
		expect([...splitLogLines('')]).toEqual([]);
	});
});

describe('turning events into a diagnosis', () => {
	const storm = (count: number, startMs: number, stepMs: number) =>
		Array.from(
			{ length: count },
			(_, index) =>
				`${new Date(startMs + index * stepMs).toISOString().replace('T', ' ').replace('Z', '')} [error] [server stderr] {"event":"tool","outcome":"ERR","code":"LEASE_HELD","trigger":"claim"}`,
		);

	it('puts a corrupted protocol channel first, whatever else is wrong', async () => {
		const read = await readServerLog([
			...storm(8, Date.parse('2026-09-02T01:00:00Z'), 1_000),
			vscode(
				'Failed to parse message: Unexpected token < in JSON at position 0',
			),
		]);
		const diagnosis = diagnoseServerLog(read);

		// Every other symptom is untrustworthy while the channel itself is
		// corrupt, so the order is a property, not a presentation detail.
		expect(diagnosis.findings[0]?.cause).toBe('stdout-protocol-corruption');
		expect(diagnosis.findings.map((finding) => finding.cause)).toContain(
			'refusal-storm',
		);
	});

	it('does not call a handful of refusals a storm', async () => {
		const read = await readServerLog(
			storm(3, Date.parse('2026-09-02T01:00:00Z'), 1_000),
		);

		expect(
			diagnoseServerLog(read).findings.filter(
				(finding) => finding.cause === 'refusal-storm',
			),
		).toEqual([]);
	});

	it('carries no log text into a finding', async () => {
		const read = await readServerLog([
			vscode(
				"fatal: pathspec '/home/ada/projects/widgets/.cache/delendai/results/logs/2026-09-02.jsonl.mutex' did not match any files",
			),
		]);
		const [finding] = diagnoseServerLog(read).findings;

		// The finding names a cause and an action, both constants of the
		// diagnosis module; the only thing derived from the line is its
		// masked shape digest.
		expect(finding?.cause).toBe('pathspec-mismatch');
		expect(JSON.stringify(finding)).not.toContain('/home/ada');
		expect(JSON.stringify(finding)).not.toContain('.mutex');
		expect(finding?.probableCause.length).toBeGreaterThan(0);
		expect(finding?.nextAction.length).toBeGreaterThan(0);
	});
});
