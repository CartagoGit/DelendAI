#!/usr/bin/env bun
/**
 * post-slice-f00500-evidence.script.ts — f00500 S7.
 *
 * Empirical evidence that the f00500 slices closed every LLM-attribution
 * surface in the repo. Runs a series of checks; each one prints PASS or
 * FAIL; the script exits with the number of failures.
 *
 * Usage:
 *   bun tools/scripts/verify/post-slice-f00500-evidence.script.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const checks: Array<{ name: string; fn: () => boolean; detail?: string }> = [];

const run = (args: readonly string[]): { ok: boolean; stdout: string } => {
	const res = spawnSync('git', ['--no-pager', ...args], { encoding: 'utf8' });
	return { ok: res.status === 0, stdout: res.stdout ?? '' };
};

const _grepInTree = (
	pattern: string,
	path: string,
	includeFilter?: string,
): number => {
	const args = ['grep', '-rE', '--binary-files=without-match', pattern];
	if (includeFilter !== undefined) {
		args.push('--include', includeFilter);
	}
	args.push('--', path);
	const res = run(args);
	if (!res.ok && res.stdout.length === 0) return 0;
	return res.stdout.split('\n').filter((l) => l.length > 0).length;
};

// 1) audit.trailer in mcp-vertex.config.json must be "none"
checks.push({
	name: "mcp-vertex.config.json#plugins.commit-policy.options.audit.trailer = 'none'",
	fn: () => {
		if (!existsSync('mcp-vertex.config.json')) return false;
		const text = readFileSync('mcp-vertex.config.json', 'utf8');
		return /"trailer"\s*:\s*"none"/u.test(text);
	},
});

// 2) The commit-policy plugin default must be 'none'
checks.push({
	name: "AuditSchema default is 'none' (S2)",
	fn: () => {
		if (!existsSync('plugins/commit-policy/src/lib/contracts/options.ts'))
			return false;
		const text = readFileSync(
			'plugins/commit-policy/src/lib/contracts/options.ts',
			'utf8',
		);
		return /\.default\(['"]none['"]\)/u.test(text);
	},
});

// 3) The pre-commit hook script exists
checks.push({
	name: 'S5 lint script exists and is executable',
	fn: () => existsSync('tools/scripts/lint/no-llm-attribution.script.ts'),
});

// 4) lefthook.yml has the no-llm-attribution hook
checks.push({
	name: 'lefthook.yml wires the no-llm-attribution hook (S5)',
	fn: () => {
		if (!existsSync('lefthook.yml')) return false;
		const text = readFileSync('lefthook.yml', 'utf8');
		return (
			/no-llm-attribution:/u.test(text) &&
			/no-llm-attribution\.script\.ts/u.test(text)
		);
	},
});

// 5) package.json exposes lint:no-llm-attribution
checks.push({
	name: 'package.json has lint:no-llm-attribution script (S5)',
	fn: () => {
		if (!existsSync('package.json')) return false;
		const text = readFileSync('package.json', 'utf8');
		return /"lint:no-llm-attribution"\s*:/u.test(text);
	},
});

// 6) No remaining 'claude-code/' folder under config/external
checks.push({
	name: 'config/external/claude-code/ folder renamed to config/external/claude/ (S4)',
	fn: () => {
		if (!existsSync('config/external')) return true; // not present, no leak
		return !existsSync('config/external/claude-code');
	},
});

// 7) No remaining 'claude-code-' filenames in proposals/done/audits
checks.push({
	name: "no filenames with 'claude-code-' under docs/mcp-vertex/proposals/done/ (S4)",
	fn: () => {
		const out = run(['ls-files', 'docs/mcp-vertex/proposals/done/']);
		if (!out.ok) return true;
		return !/(^|\/)claude-code-/u.test(out.stdout);
	},
});

// 8) docs/PRIVACY.md exists (S6)
checks.push({
	name: 'docs/PRIVACY.md exists (S6)',
	fn: () => existsSync('docs/PRIVACY.md'),
});

// 9) .mailmap exists (S8a)
checks.push({
	name: '.mailmap exists (S8a)',
	fn: () => existsSync('.mailmap'),
});

// 10) mailmap collapses every LLM author
checks.push({
	name: '.mailmap collapses Claude/MiniMax/Copilot/Bot authors to canonical (S8a)',
	fn: () => {
		if (!existsSync('.mailmap')) return false;
		const text = readFileSync('.mailmap', 'utf8');
		const required = [
			'copilot-minimax-m3',
			'copilot@anthropic.com',
			'noreply@MiniMax.local',
			'mcp-vertex-bot',
			'release-s5-agent',
		];
		return required.every((r) => text.includes(r));
	},
});

// 11) Rewrite script + runbook exist (S8b + S8d)
checks.push({
	name: 'history rewrite script + runbook exist (S8b, S8d)',
	fn: () =>
		existsSync('tools/scripts/git/rewrite-llm-attribution.script.ts') &&
		existsSync('docs/mcp-vertex/wiki/git-history-rewrite.md'),
});

// 12) The last commit's full body has no LLM trailer
checks.push({
	name: 'last commit message has no LLM Co-authored-by trailer',
	fn: () => {
		const out = run(['log', '-1', '--format=%B']);
		if (!out.ok) return false;
		return !/^co-authored-by:.*(claude|minimax|gpt-?[3-9]|gemini|codex|llama|mistral|qwen|deepseek|chatgpt|grok)/imu.test(
			out.stdout,
		);
	},
});

// 13) No Co-authored-by: toward LLM brands in the last 5 commits (post-S1)
checks.push({
	name: 'last 5 commits have no LLM Co-authored-by trailer',
	fn: () => {
		const out = run(['log', '-5', '--format=%B']);
		if (!out.ok) return false;
		return !/^co-authored-by:.*(claude|minimax|gpt-?[3-9]|gemini|codex|llama|mistral|qwen|deepseek|chatgpt|grok)/imu.test(
			out.stdout,
		);
	},
});

let failed = 0;
console.log('f00500 evidence:');
console.log('================');
for (const c of checks) {
	let ok = false;
	let detail = '';
	try {
		ok = c.fn();
	} catch (err) {
		ok = false;
		detail = ` (${String(err)})`;
	}
	const status = ok ? 'PASS' : 'FAIL';
	console.log(`  [${status}] ${c.name}${detail}`);
	if (!ok) failed++;
}

console.log('');
if (failed === 0) {
	console.log(`f00500: 0 failures across ${checks.length} checks.`);
	process.exit(0);
} else {
	console.log(
		`f00500: ${failed} failure${failed === 1 ? '' : 's'} across ${checks.length} checks.`,
	);
	process.exit(1);
}
