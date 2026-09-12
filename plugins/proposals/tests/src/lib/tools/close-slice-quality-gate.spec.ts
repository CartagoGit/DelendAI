/**
 * The regression guard for a gate that could not recognise a pass.
 *
 * `runCloseSliceQualityGate` shells `bun run validate --json` through
 * `runAcceptanceCriteria`, which returns stdout AND stderr joined. `bun
 * run <script>` unconditionally echoes `$ <the command>` on stderr, even
 * with nothing attached to a TTY — so the captured text is never the
 * bare JSON document the gate used to `JSON.parse` wholesale. Every
 * parse threw, every run fell through to the synthetic failure, and
 * `close_slice` refused every close with `quality-failed` no matter what
 * the quality gate had actually reported.
 *
 * These run the real function against a real workspace, because the bug
 * lived precisely in the gap between "what the command prints" and "what
 * the parser assumed it prints" — a stubbed runner would have kept
 * reproducing the assumption.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { runCloseSliceQualityGate } from '@delendai/proposals/lib/tools/authoring.tool';

const workspaces: string[] = [];

afterAll(() => {
	for (const dir of workspaces) rmSync(dir, { recursive: true, force: true });
});

/** A workspace whose `validate` script prints exactly `report`. */
const workspaceReporting = (report: string, exitCode: number): string => {
	const dir = mkdtempSync(join(tmpdir(), 'close-quality-gate-'));
	workspaces.push(dir);
	mkdirSync(join(dir, 'tools'), { recursive: true });
	writeFileSync(
		join(dir, 'tools/report.ts'),
		`console.log(${JSON.stringify(report)});\nprocess.exit(${exitCode});\n`,
		'utf8',
	);
	writeFileSync(
		join(dir, 'package.json'),
		JSON.stringify({
			name: 'close-quality-gate-fixture',
			private: true,
			scripts: { validate: 'bun tools/report.ts' },
		}),
		'utf8',
	);
	return dir;
};

describe('runCloseSliceQualityGate', () => {
	it('reads a PASS even though bun echoes the command on stderr', async () => {
		const dir = workspaceReporting(
			JSON.stringify({
				ok: true,
				severity: 'ok',
				findings: [],
				summary: { ok: true, scopes: 3 },
			}),
			0,
		);

		const result = await runCloseSliceQualityGate(dir);

		expect(result.ok).toBe(true);
		expect(result.severity).toBe('ok');
		expect(result.summary).toEqual({ ok: true, scopes: 3 });
	});

	it('reads a FAIL and keeps the reported findings', async () => {
		const dir = workspaceReporting(
			JSON.stringify({
				ok: false,
				severity: 'error',
				findings: ['lint: 2 errors'],
				summary: { ok: false, scopes: 3 },
			}),
			1,
		);

		const result = await runCloseSliceQualityGate(dir);

		expect(result.ok).toBe(false);
		expect(result.severity).toBe('error');
		expect(result.findings).toEqual(['lint: 2 errors']);
	});

	it('fails closed when the command prints no report at all', async () => {
		const dir = workspaceReporting('quality ran, no structured output', 0);

		const result = await runCloseSliceQualityGate(dir);

		expect(result.ok).toBe(false);
		expect(result.severity).toBe('error');
		expect(result.findings.join('\n')).toContain('quality ran');
	});
});
