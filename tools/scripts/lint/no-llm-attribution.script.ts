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
const LLM_PHRASES: ReadonlyArray<readonly string[]> = [
	// claude
	['claude', 'opus'],
	['claude', 'sonnet'],
	['claude', 'haiku'],
	['claude', 'fable', '5'],
	['claude', 'fable'],
	['claude', 'minimax', 'm3'],
	['claude', 'chat'],
	['claude', 'm3'],
	['claude', '4'],
	['claude', '5'],
	['claude', '3'],
	// minimax
	['minimax', 'm3'],
	['minimax', 'opus'],
	['minimax', 'sonnet'],
	['minimax', 'haiku'],
	['minimax', 'pro'],
	['minimax', 'mini'],
	// gpt
	['gpt', '3'],
	['gpt', '4'],
	['gpt', '5'],
	['gpt', '4o'],
	['gpt', '5o'],
	['chatgpt'],
	// gemini
	['gemini', '1'],
	['gemini', '2'],
	['gemini', '3'],
	['gemini', 'pro'],
	['gemini', 'ultra'],
	['gemini', 'flash'],
	// copilot
	['copilot', 'minimax', 'm3'],
	['copilot', 'minimax'],
	['copilot', 'gpt'],
	['copilot', 'claude'],
	['copilot', 'gemini'],
	// codex
	['codex', 'gpt', '5'],
	['codex', 'gpt'],
	['codex', 'minimax'],
	['codex', 'claude'],
	// grok
	['grok', '1'],
	['grok', '2'],
	['grok', '3'],
	['grok', '4'],
	// llama
	['llama', '2'],
	['llama', '3'],
	['llama', '4'],
	// mistral
	['mistral', '7b'],
	['mistral', '8x7b'],
	['mixtral'],
	// qwen
	['qwen', '2'],
	['qwen', '3'],
	// deepseek
	['deepseek', 'v1'],
	['deepseek', 'v2'],
	['deepseek', 'v3'],
];

const LLM_DOMAINS: ReadonlyArray<string> = [
	'anthropic.com',
	'minimax.ai',
	'minimax.local',
	'users.noreply.github.com',
	// Synthetic / placeholder LLM emails used in this repo's history
	'copilot@local',
	'copilot@anthropic',
	'copilot@minimax',
];

// Header names that count as an "attribution" trailer. Git's trailer
// convention is case-insensitive but always Title-Cased on output, so we
// accept both shapes.
const TRAILER_KEY =
	/^(?:co-?authored-by|signed-off-by|generated-?with|generated-?by|reviewed-?by|thanked|helped-?by)$/iu;

// "Generated with X" / "Built with X" / "🤖 Generated with X" preambles.
// We extract the model name(s) after "with/using/by" and check the resulting
// tokens against the LLM_PHRASES list.
const GENERATED_PREAMBLE =
	/^\s*(?:🤖\s*)?(?:generated|written|built|crafted|created|produced)\s+(?:with|by|using)\s+(.+)$/iu;

const tokenize = (value: string): readonly string[] =>
	value
		.toLowerCase()
		.split(/[^a-z0-9]+/u)
		.filter((t) => t.length > 0);

const matchesLlmPhrase = (
	tokens: readonly string[],
): readonly string[] | null => {
	for (const phrase of LLM_PHRASES) {
		// Look for the phrase as a contiguous subsequence
		for (let i = 0; i + phrase.length <= tokens.length; i++) {
			let ok = true;
			for (let j = 0; j < phrase.length; j++) {
				if (tokens[i + j] !== phrase[j]) {
					ok = false;
					break;
				}
			}
			if (ok) return phrase;
		}
	}
	return null;
};

const matchesLlmDomain = (value: string): string | null => {
	const lower = value.toLowerCase();
	for (const d of LLM_DOMAINS) {
		// Match when the domain appears after an @ (so `copilot@local`
		// matches) OR when the value is the bare domain (so a `Local-Part:
		// copilot@local` still trips). We require a word boundary before
		// `@` so `notllmatminimax.ai` doesn't false-positive on `minimax.ai`.
		const re = new RegExp(
			`(?:^|[^a-z0-9])@?${d.replace(/\./gu, '\\.')}`,
			'iu',
		);
		if (re.test(lower)) return d;
	}
	return null;
};

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
				const tokens = tokenize(tail);
				const phrase = matchesLlmPhrase(tokens);
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
		if (!TRAILER_KEY.test(key)) continue;
		const valueClean = value.replace(/[<>"'`]+/gu, ' ').trim();
		// Tokenize the WHOLE value (name + email local-part), so
		// "Claude Opus 5 <noreply@anthropic.com>" → ["claude","opus","5","noreply","anthropic","com"]
		// and the phrase "claude opus" matches.
		const tokens = tokenize(valueClean);
		const phrase = matchesLlmPhrase(tokens);
		const domain = matchesLlmDomain(valueClean);
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
