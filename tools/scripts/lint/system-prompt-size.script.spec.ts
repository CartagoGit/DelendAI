import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	PROMPT_SIZE_BUDGETS,
	measurePromptSizes,
	formatResults,
	type IPromptSizeBudget,
} from './system-prompt-size.script';

describe('system-prompt-size lint (f00086 S3)', () => {
	let root = '';

	const write = (rel: string, body: string): void => {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body);
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'prompt-size-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const smallBudgets: readonly IPromptSizeBudget[] = [
		{ file: 'AGENTS.md', maxBytes: 100 },
	];

	it('passes when a tracked file is within budget', async () => {
		write('AGENTS.md', 'a'.repeat(50));
		const results = await measurePromptSizes(root, smallBudgets);
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			file: 'AGENTS.md',
			bytes: 50,
			overBudget: false,
			missing: false,
		});
	});

	it('flags overBudget when a tracked file exceeds its cap', async () => {
		write('AGENTS.md', 'a'.repeat(200));
		const results = await measurePromptSizes(root, smallBudgets);
		expect(results[0]?.overBudget).toBe(true);
		expect(results[0]?.bytes).toBe(200);
	});

	it('flags a tracked-but-missing file (rename drift hazard)', async () => {
		const results = await measurePromptSizes(root, smallBudgets);
		expect(results[0]?.missing).toBe(true);
		expect(results[0]?.overBudget).toBe(false);
	});

	it('measures UTF-8 bytes, not characters', async () => {
		// "é" is 2 bytes in UTF-8, so 60 chars = 120 bytes > 100.
		write('AGENTS.md', 'é'.repeat(60));
		const results = await measurePromptSizes(root, smallBudgets);
		expect(results[0]?.bytes).toBe(120);
		expect(results[0]?.overBudget).toBe(true);
	});

	it('formatResults renders ok / OVER / MISSING lines', async () => {
		write('AGENTS.md', 'a'.repeat(200));
		const results = await measurePromptSizes(root, smallBudgets);
		const out = formatResults(results);
		expect(out).toContain('OVER');
		expect(out).toContain('AGENTS.md');
		expect(out).toContain('200B / 100B');
	});

	it('the real repo files are within their committed budgets', async () => {
		// Guards against the baseline drifting: run the canonical budgets
		// against the actual repo (cwd is the repo root under vitest).
		const results = await measurePromptSizes(
			process.cwd(),
			PROMPT_SIZE_BUDGETS,
		);
		for (const r of results) {
			expect(r.missing, `${r.file} is tracked but missing`).toBe(false);
			expect(
				r.overBudget,
				`${r.file} = ${r.bytes}B exceeds ${r.maxBytes}B`,
			).toBe(false);
		}
	});
});
