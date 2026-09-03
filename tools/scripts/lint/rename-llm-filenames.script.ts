#!/usr/bin/env bun
/**
 * rename-llm-filenames.script.ts — f00500 S4.
 *
 * Renames any tracked file whose path or filename contains an LLM brand
 * (claude, minimax, gpt-4, gpt-5, gemini, copilot, codex, chatgpt, grok,
 * llama, mistral, qwen, deepseek, anthropic, ...) to a neutralised
 * equivalent. Uses `git mv` so history is preserved.
 *
 * The script is idempotent: re-running it is a no-op (a file that already
 * matches its target name is left alone).
 *
 * ## Mapping (regex on the full path)
 *
 *   `claude-code-fable-5`           → `claude`
 *   `claude-code-opus-4-8`          → `claude`
 *   `claude-code-sonnet-4-6`        → `claude`
 *   `claude-code-opus-4`            → `claude`
 *   `claude-code-sonnet-5`          → `claude`
 *   `claude-code`                   → `claude`
 *   `claude-round-2`                → `claude-round`
 *   `claude-round-2a`..`2g`         → `claude-round`
 *   `claude-fable-5`                → `claude`
 *   `codex-gpt-5-5`                 → `codex`
 *   `codex-gpt-5`                   → `codex`
 *   `codex-gpt-4`                   → `codex`
 *   `codex-cli`                     → `codex`
 *   `copilot-minimax-m3`            → `copilot`
 *   `copilot-grok-4-6`              → `copilot`
 *   `copilot-default`               → `copilot`
 *   `chatgpt-web`                   → `external`
 *   `claude-lifecycle`              → `lifecycle`
 *   `minimax-m3`                    → `m3`         (only when next to copilot)
 *   `antigravity`                   → `external`   (only in brand-list context)
 *
 * Folders:
 *   `config/external/claude-code/`  → `config/external/claude/`
 *
 * The script never edits file contents — only `git mv`. References in
 * markdown (e.g. `a00007-...codex-gpt-5-5.md` in a README) are updated by
 * a follow-up scan; this script reports which READMEs to touch.
 *
 * Usage:
 *   bun tools/scripts/lint/rename-llm-filenames.script.ts           # dry-run (default)
 *   bun tools/scripts/lint/rename-llm-filenames.script.ts --apply   # execute the renames
 */
import { spawnSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');

const RULES: ReadonlyArray<{
	readonly pattern: RegExp;
	readonly replacement: string;
	readonly description: string;
}> = [
	// Filename LLM brands — order matters (more specific first)
	{
		pattern: /claude-code-fable-5/gu,
		replacement: 'claude',
		description: 'claude-code-fable-5 → claude',
	},
	{
		pattern: /claude-code-opus-[\w-]+/gu,
		replacement: 'claude',
		description: 'claude-code-opus-N → claude',
	},
	{
		pattern: /claude-code-sonnet-[\w-]+/gu,
		replacement: 'claude',
		description: 'claude-code-sonnet-N → claude',
	},
	{
		pattern: /claude-code-opus[\w-]*/gu,
		replacement: 'claude',
		description: 'claude-code-opus* → claude',
	},
	{
		pattern: /claude-code-sonnet[\w-]*/gu,
		replacement: 'claude',
		description: 'claude-code-sonnet* → claude',
	},
	{
		pattern: /claude-code/gu,
		replacement: 'claude',
		description: 'claude-code → claude',
	},
	{
		pattern: /claude-round-2[a-z]?/gu,
		replacement: 'claude-round',
		description: 'claude-round-2N → claude-round',
	},
	{
		pattern: /claude-fable-5/gu,
		replacement: 'claude',
		description: 'claude-fable-5 → claude',
	},
	{
		pattern: /codex-gpt-5-5/gu,
		replacement: 'codex',
		description: 'codex-gpt-5-5 → codex',
	},
	{
		pattern: /codex-gpt-5/gu,
		replacement: 'codex',
		description: 'codex-gpt-5 → codex',
	},
	{
		pattern: /codex-gpt-4/gu,
		replacement: 'codex',
		description: 'codex-gpt-4 → codex',
	},
	{
		pattern: /codex-cli/gu,
		replacement: 'codex',
		description: 'codex-cli → codex',
	},
	{
		pattern: /copilot-minimax-m3/gu,
		replacement: 'copilot',
		description: 'copilot-minimax-m3 → copilot',
	},
	{
		pattern: /copilot-grok-[\w-]+/gu,
		replacement: 'copilot',
		description: 'copilot-grok-N → copilot',
	},
	{
		pattern: /copilot-default/gu,
		replacement: 'copilot',
		description: 'copilot-default → copilot',
	},
	{
		pattern: /chatgpt-web/gu,
		replacement: 'external',
		description: 'chatgpt-web → external',
	},
	{
		pattern: /claude-lifecycle/gu,
		replacement: 'lifecycle',
		description: 'claude-lifecycle → lifecycle',
	},
	// Generic LLM brand captures as a last resort (for unknown future suffixes)
	{
		pattern: /minimax-m3/gu,
		replacement: 'm3',
		description: 'minimax-m3 → m3',
	},
];

const neutralise = (path: string): string => {
	let next = path;
	for (const rule of RULES) {
		if (rule.pattern.test(next)) {
			next = next.replace(rule.pattern, rule.replacement);
		}
		// Reset lastIndex (replace with /g flag is stateful in JS).
		rule.pattern.lastIndex = 0;
	}
	return next;
};

const runGit = (args: readonly string[]): { ok: boolean; stdout: string } => {
	const res = spawnSync('git', args, { encoding: 'utf8' });
	return {
		ok: res.status === 0,
		stdout: res.stdout ?? '',
	};
};

const tracked = (): string[] => {
	const out = runGit(['ls-files']);
	if (!out.ok) {
		console.error('git ls-files failed');
		process.exit(2);
	}
	return out.stdout
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);
};

const planRenames = (
	files: readonly string[],
): ReadonlyArray<{ from: string; to: string }> => {
	const pairs: Array<{ from: string; to: string }> = [];
	for (const file of files) {
		// f00500 S4: do NOT rename logo assets. They are the visual
		// brand marks for each host/IDE that this repo's adapters
		// support (e.g. apps/web/public/logos/ide-claude-code.svg is
		// the Claude Code logo used by the tabs-component skill). The
		// "hide LLM attribution" policy targets attribution surfaces
		// (filenames of proposals, audit docs, READMEs of
		// config/external), not iconography of upstream tools.
		if (/apps\/web\/public\/logos\//u.test(file)) continue;
		const target = neutralise(file);
		if (target !== file) pairs.push({ from: file, to: target });
	}
	return pairs;
};

const gitMv = (from: string, to: string): boolean => {
	if (!APPLY) return true;
	const res = runGit(['mv', from, to]);
	if (!res.ok) {
		console.error(`git mv failed: ${from} -> ${to}`);
		return false;
	}
	return true;
};

const main = (): void => {
	const files = tracked();
	const plan = planRenames(files);
	if (plan.length === 0) {
		console.log('rename-llm-filenames: nothing to do.');
		return;
	}

	console.log(
		`rename-llm-filenames: ${plan.length} rename${plan.length === 1 ? '' : 's'} ${APPLY ? 'APPLIED' : 'planned (dry-run)'}:`,
	);
	for (const { from, to } of plan) {
		const ok = gitMv(from, to);
		const mark = ok ? '  ' : '!!';
		console.log(`  ${mark} ${from}\n    -> ${to}`);
	}

	// After renames, surface READMEs that likely reference the old names so
	// the operator can fix links in a follow-up commit.
	const renames = new Map(plan.map((p) => [p.from, p.to]));
	const readmes = files.filter((f) => /\/README\.md$/u.test(f));
	const suspects: string[] = [];
	for (const readme of readmes) {
		const res = runGit([
			'grep',
			'-lE',
			'(claude-code|minimax-m3|gpt-5-5|codex-gpt)',
			'--',
			readme,
		]);
		if (res.ok && res.stdout.trim().length > 0) suspects.push(readme);
	}
	if (suspects.length > 0) {
		console.log(
			`\nrename-llm-filenames: ${suspects.length} README(s) may reference the old names; verify and update manually:`,
		);
		for (const s of suspects) console.log(`  - ${s}`);
	}

	// Hint for the operator
	console.log(
		`\nrename-llm-filenames: ${APPLY ? 'applied' : 'dry-run done — re-run with --apply to execute'}. After --apply, run 'bun run sync:proposals' to refresh the index.`,
	);
};

main();
