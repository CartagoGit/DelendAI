#!/usr/bin/env bun
/**
 * no-llm-attribution.spec.ts — f00500 S5.
 *
 * Tests the scan logic by feeding canned commit messages and file
 * contents through the script via `bun -e` (we don't shell out to git
 * here — the script also accepts a <commit-msg-file> arg that we use
 * as the entry point for fixture tests).
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = 'tools/scripts/lint/no-llm-attribution.script.ts';

let workDir: string;
let tmpFile: string;

beforeAll(() => {
	workDir = mkdtempSync(join(tmpdir(), 'no-llm-attribution-'));
	tmpFile = join(workDir, 'COMMIT_EDITMSG');
});

afterAll(() => {
	rmSync(workDir, { recursive: true, force: true });
});

const runScript = (
	commitMsg: string,
	extraArgs: readonly string[] = [],
): { status: number; stdout: string; stderr: string } => {
	writeFileSync(tmpFile, commitMsg, 'utf8');
	const res = spawnSync('bun', [SCRIPT, tmpFile, ...extraArgs], {
		encoding: 'utf8',
	});
	return {
		status: res.status ?? -1,
		stdout: res.stdout ?? '',
		stderr: res.stderr ?? '',
	};
};

describe('no-llm-attribution.script.ts', () => {
	it('passes a clean conventional commit with no trailer', () => {
		const r = runScript('feat: add dashboard widget\n\nSome body text.\n');
		expect(r.status).toBe(0);
		expect(r.stdout).toContain('ok');
	});

	it('passes a human-human Co-authored-by trailer', () => {
		const r = runScript(
			'feat: ship the user-list\n\nCo-authored-by: Alice <alice@personal.example>\n',
		);
		expect(r.status).toBe(0);
	});

	it('passes a generic Generated with no brand mention', () => {
		const r = runScript(
			'feat: refactor\n\nGenerated with internal toolchain.\n',
		);
		expect(r.status).toBe(0);
	});

	it('refuses Co-authored-by: Claude Opus 5', () => {
		const r = runScript(
			'feat: x\n\nCo-authored-by: Claude Opus 5 <noreply@anthropic.com>\n',
		);
		expect(r.status).toBe(1);
		expect(r.stderr).toContain('Claude Opus 5');
		expect(r.stderr).toContain('PRIVACY');
	});

	it('refuses Co-authored-by with anthropic.com domain', () => {
		const r = runScript(
			'feat: x\n\nCo-authored-by: Some Alias <alias@anthropic.com>\n',
		);
		expect(r.status).toBe(1);
	});

	it('refuses Co-authored-by: minimax M3', () => {
		const r = runScript(
			'feat: x\n\nCo-authored-by: minimax M3 <minimax@users.noreply.github.com>\n',
		);
		expect(r.status).toBe(1);
		expect(r.stderr).toContain('minimax');
	});

	it('refuses GPT-5 attribution', () => {
		const r = runScript(
			'feat: x\n\nCo-authored-by: gpt-5 <gpt-5@users.noreply.github.com>\n',
		);
		expect(r.status).toBe(1);
	});

	it('refuses Gemini attribution', () => {
		const r = runScript(
			'feat: x\n\nCo-authored-by: gemini-2.5 <gemini@anthropic.com>\n',
		);
		expect(r.status).toBe(1);
	});

	it("refuses a body preamble 'Generated with claude-opus-4.8'", () => {
		const r = runScript('feat: x\n\n🤖 Generated with claude-opus-4.8\n');
		expect(r.status).toBe(1);
		expect(r.stderr).toMatch(/preamble/i);
	});

	it('refuses Signed-off-by with LLM brand', () => {
		const r = runScript(
			'feat: x\n\nSigned-off-by: copilot <copilot@local>\n',
		);
		expect(r.status).toBe(1);
	});

	it('refuses multiple violations in one message', () => {
		const r = runScript(
			[
				'feat: x',
				'',
				'Co-authored-by: Claude Opus 5 <noreply@anthropic.com>',
				'Co-authored-by: minimax M3 <minimax@users.noreply.github.com>',
			].join('\n'),
		);
		expect(r.status).toBe(1);
		// Both should be reported (at least 2 violations in stderr)
		const violationLines = r.stderr
			.split('\n')
			.filter((l) => l.startsWith('  - '));
		expect(violationLines.length).toBeGreaterThanOrEqual(2);
	});

	it('case-insensitive brand detection (CLAUDE, Minimax, GPT)', () => {
		const r = runScript(
			'feat: x\n\nCo-authored-by: CLAUDE <claude@anthropic.com>\n',
		);
		expect(r.status).toBe(1);
	});

	it('allows attribution that mentions a real human whose name is a substring of an LLM brand (positive case)', () => {
		// 'claude' as part of a human name without an LLM brand should still pass.
		// Our regex requires a longer pattern match (claude[\w-]*), so 'Claude Smith'
		// without the typical LLM suffix should pass.
		const r = runScript(
			'feat: x\n\nCo-authored-by: Claude Smith <claude.smith@example.com>\n',
		);
		// This is a known false-positive boundary; document it by accepting either
		// outcome (passing keeps Claude Smith legit, refusing catches LLM).
		// The conservative call is to ALLOW it because the local part is a
		// human name with no model suffix and the domain is non-LLM.
		expect(r.status).toBe(0);
	});
});
