#!/usr/bin/env bun
/**
 * no-llm-attribution.script.ts — f00500 S5.
 *
 * Defence-in-depth: refuse any commit message or staged file that contains
 * an LLM-attributing trailer (Co-authored-by, Signed-off-by, Generated with,
 * 🤖 emoji) mentioning an LLM brand.
 *
 * Exit codes:
 *   0  no violations
 *   1  one or more violations
 *   2  bad invocation
 *
 * Usage:
 *   bun tools/scripts/lint/no-llm-attribution.script.ts                        # scan staged diff + working tree
 *   bun tools/scripts/lint/no-llm-attribution.script.ts <commit-msg-file>     # scan a specific commit message
 *   bun tools/scripts/lint/no-llm-attribution.script.ts --diff                # only scan git diff --cached
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import {
	GENERATED_PREAMBLE,
	llmDomainIn,
	llmPhraseIn,
	TRAILER_KEY,
} from './llm-attribution-rules';

const ARGS = process.argv.slice(2);
const ONLY_DIFF = ARGS.includes('--diff');
const MSG_FILE = ARGS.find((a) => !a.startsWith('--') && a.length > 0);

// ---------- Detection rules ----------
//
// We need to allow `Co-authored-by: Claude Smith <claude.smith@example.com>`
// (a real human) while still rejecting
// `Co-authored-by: Claude Opus 5 <noreply@anthropic.com>` (an LLM).
//
// Strategy: tokenize the value into a stream of words (split on whitespace
// and on `-`), then test that stream against a list of LLM PHRASES.
// An LLM phrase is a sequence of 1-3 tokens that uniquely identifies an
// LLM. Examples of LLM phrases: ["claude", "opus"], ["claude", "sonnet"],
// ["claude", "fable", "5"], ["minimax", "m3"], ["gpt", "4"], ["gpt", "5"],
// ["claude", "3"], ["claude", "4"], ["claude", "5"], ["codex", "gpt", "5"],
// ["copilot", "minimax", "m3"], ["gemini", "pro"], ["grok", "4"], etc.
//
// A bare "claude" alone is NOT an LLM phrase — that's what makes a human
// named "Claude Smith" pass. The phrase "claude opus" or "claude sonnet" IS.
//
// The tokenizer splits on every non-letter-or-digit run, so
// "claude.smith@example.com" → ["claude", "smith", "example", "com"]
// (no phrase matches). "claude-opus-4-8" → ["claude", "opus", "4", "8"]
// (phrase "claude opus" matches). "minimax-m3" → ["minimax", "m3"]
// (phrase "minimax m3" matches).
// The detection policy lives in one module, shared with the history
// rewriter — see the header of `llm-attribution-rules.ts` for why.
interface Violation {
	readonly source: string;
	readonly line: string;
	readonly reason: string;
}

const scanText = (text: string, source: string): Violation[] => {
	const out: Violation[] = [];
	const lines = text.split('\n');
	for (const line of lines) {
		const m = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.+)$/u);
		if (m === null) {
			// Body line: check for "Generated with X" preambles
			const pm = line.match(GENERATED_PREAMBLE);
			if (pm !== null) {
				const tail = pm[1] ?? '';
				const phrase = llmPhraseIn(tail);
				if (phrase !== null) {
					out.push({
						source,
						line,
						reason: `generated-with preamble names an LLM (phrase: ${phrase.join(' ')})`,
					});
				}
			}
			continue;
		}
		const [, key, value] = m;
		// A regex group is `string | undefined` under
		// `noUncheckedIndexedAccess`, and a trailer line whose value is
		// empty is a trailer with nothing to judge — skipping it is the
		// answer, not asserting the group is present.
		if (key === undefined || value === undefined) continue;
		if (!TRAILER_KEY.test(key)) continue;
		const valueClean = value.replace(/[<>"'`]+/gu, ' ').trim();
		// Tokenize the WHOLE value (name + email local-part), so
		// "Claude Opus 5 <noreply@anthropic.com>" → ["claude","opus","5","noreply","anthropic","com"]
		// and the phrase "claude opus" matches.
		const phrase = llmPhraseIn(valueClean);
		const domain = llmDomainIn(valueClean);
		if (phrase !== null) {
			out.push({
				source,
				line,
				reason: `trailer "${key}" names an LLM (phrase: ${phrase.join(' ')})`,
			});
		} else if (domain !== null) {
			out.push({
				source,
				line,
				reason: `trailer "${key}" uses an LLM-only domain (@${domain})`,
			});
		}
	}
	return out;
};

const run = (
	args: readonly string[],
): { ok: boolean; stdout: string; stderr: string } => {
	const res = spawnSync('git', args, { encoding: 'utf8' });
	return {
		ok: res.status === 0,
		stdout: res.stdout ?? '',
		stderr: res.stderr ?? '',
	};
};

const main = (): void => {
	const violations: Violation[] = [];

	if (MSG_FILE !== undefined) {
		let text: string;
		try {
			text = readFileSync(MSG_FILE, 'utf8');
		} catch (err) {
			console.error(
				`no-llm-attribution: cannot read ${MSG_FILE}: ${String(err)}`,
			);
			process.exit(2);
		}
		violations.push(...scanText(text, MSG_FILE));
	} else {
		// 1) Staged commit message
		const head = run(['rev-parse', '--git-dir']);
		if (head.ok) {
			const editMsg = `${head.stdout.trim()}/COMMIT_EDITMSG`;
			try {
				if (existsSync(editMsg)) {
					const text = readFileSync(editMsg, 'utf8');
					violations.push(...scanText(text, editMsg));
				}
			} catch {
				// ignore
			}
		}

		// 2) Staged files
		const fileRes = run([
			'diff',
			'--cached',
			'--name-only',
			'--diff-filter=ACMR',
		]);
		if (fileRes.ok) {
			const files = fileRes.stdout
				.split('\n')
				.map((s) => s.trim())
				.filter(Boolean);
			for (const file of files) {
				try {
					if (!existsSync(file)) continue;
					const text = readFileSync(file, 'utf8');
					violations.push(...scanText(text, file));
				} catch {
					// binary / deleted / unreadable
				}
			}
		}

		// 3) Working tree (skipped when --diff)
		if (!ONLY_DIFF) {
			const status = run(['status', '--porcelain']);
			if (status.ok) {
				const dirty = status.stdout
					.split('\n')
					.map((s) => s.trim().slice(3))
					.filter(Boolean);
				for (const file of dirty) {
					try {
						if (!existsSync(file)) continue;
						const text = readFileSync(file, 'utf8');
						violations.push(...scanText(text, file));
					} catch {
						// skip
					}
				}
			}
		}
	}

	if (violations.length === 0) {
		console.log('no-llm-attribution: ok');
		process.exit(0);
	}

	console.error(
		`no-llm-attribution: ${violations.length} violation${violations.length === 1 ? '' : 's'}:`,
	);
	for (const v of violations) {
		console.error(`  - ${v.source}: ${v.reason}`);
		console.error(`      ${v.line.trim()}`);
	}
	console.error(
		'\nRefusing the commit. Drop the LLM brand from the trailer and retry.\n' +
			'This is enforced by f00500 S5: only the human maintainer should appear as commit author / co-author on GitHub.\n' +
			'See docs/PRIVACY.md for the full policy.',
	);
	process.exit(1);
};

main();
