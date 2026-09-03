#!/usr/bin/env bun
/**
 * rewrite-llm-attribution.script.ts — f00500 S8b.
 *
 * DESTRUCTIVE history rewrite. Removes every LLM-attributing trailer
 * (`Co-Authored-By: Claude ...`, `Co-Authored-By: MiniMax M3 ...`, etc.)
 * from the commit history, AND collapses every LLM-attributed author onto
 * the canonical `Cartago <cartago.relaxingcup@gmail.com>` identity using
 * the repo's `.mailmap` file.
 *
 * This script is NEVER executed automatically. It is the runbook half of
 * S8d: an operator must:
 *   1. Coordinate with all collaborators.
 *   2. Run `git clone --mirror` to take a backup.
 *   3. Run this script in `--apply` mode on a fresh clone of the mirror.
 *   4. Verify `git log --all --format='%B' | grep -ciE 'co-authored-by:.*(claude|minimax|gpt|gemini|codex|llama|mistral|qwen|deepseek|chatgpt|grok)'` returns 0.
 *   5. Force-push to origin (re-clone for collaborators).
 *   6. Leave the old refs in `refs/original/*` for 30 days.
 *
 * The script defaults to `--dry-run` mode: it prints a report of what
 * WOULD change, never touching history. `--apply` performs the rewrite.
 *
 * Tools:
 *   - `git filter-repo` (preferred, requires `pip install git-filter-repo`).
 *   - Falls back to `git filter-branch` if filter-repo is unavailable.
 *
 * Usage:
 *   bun tools/scripts/git/rewrite-llm-attribution.script.ts               # dry-run report
 *   bun tools/scripts/git/rewrite-llm-attribution.script.ts --apply      # execute the rewrite
 *   bun tools/scripts/git/rewrite-llm-attribution.script.ts --backup     # take a mirror backup
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const BACKUP = ARGS.includes('--backup');

// Phrases that name an LLM in a trailer value. MUST stay in sync with
// `tools/scripts/lint/no-llm-attribution.script.ts#LLM_PHRASES`.
const LLM_PHRASES: ReadonlyArray<readonly string[]> = [
	['claude', 'opus'],
	['claude', 'sonnet'],
	['claude', 'haiku'],
	['claude', 'fable', '5'],
	['claude', 'minimax', 'm3'],
	['claude', 'chat'],
	['claude', 'm3'],
	['claude', '4'],
	['claude', '5'],
	['claude', '3'],
	['minimax', 'm3'],
	['minimax', 'opus'],
	['minimax', 'sonnet'],
	['minimax', 'pro'],
	['minimax', 'mini'],
	['gpt', '3'],
	['gpt', '4'],
	['gpt', '5'],
	['gpt', '4o'],
	['gpt', '5o'],
	['chatgpt'],
	['gemini', '1'],
	['gemini', '2'],
	['gemini', '3'],
	['gemini', 'pro'],
	['gemini', 'ultra'],
	['gemini', 'flash'],
	['copilot', 'minimax', 'm3'],
	['copilot', 'gpt'],
	['copilot', 'claude'],
	['codex', 'gpt', '5'],
	['codex', 'gpt'],
	['codex', 'minimax'],
	['grok', '1'],
	['grok', '2'],
	['grok', '3'],
	['grok', '4'],
	['llama', '2'],
	['llama', '3'],
	['llama', '4'],
	['mistral', '7b'],
	['mixtral'],
	['qwen', '2'],
	['qwen', '3'],
	['deepseek', 'v1'],
	['deepseek', 'v2'],
	['deepseek', 'v3'],
];
const LLM_DOMAINS: ReadonlyArray<string> = [
	'anthropic.com',
	'minimax.ai',
	'minimax.local',
	'users.noreply.github.com',
	'copilot@local',
	'copilot@anthropic',
];

const tokenize = (s: string): readonly string[] =>
	s
		.toLowerCase()
		.split(/[^a-z0-9]+/u)
		.filter((t) => t.length > 0);

const matchesLlmPhrase = (
	tokens: readonly string[],
): readonly string[] | null => {
	for (const phrase of LLM_PHRASES) {
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
		const re = new RegExp(
			`(?:^|[^a-z0-9])@?${d.replace(/\./gu, '\\.')}`,
			'iu',
		);
		if (re.test(lower)) return d;
	}
	return null;
};

const trailerIsLlm = (line: string): boolean => {
	const m = line.match(/^[A-Za-z][\w-]*\s*:\s*(.+)$/u);
	if (m === null) return false;
	const value = (m[1] ?? '').replace(/[<>"'`]+/gu, ' ').trim();
	const tokens = tokenize(value);
	return (
		matchesLlmPhrase(tokens) !== null || matchesLlmDomain(value) !== null
	);
};

const runGit = (
	cwd: string,
	args: readonly string[],
): { ok: boolean; stdout: string; stderr: string } => {
	const res = spawnSync('git', ['--no-pager', ...args], {
		cwd,
		encoding: 'utf8',
	});
	return {
		ok: res.status === 0,
		stdout: res.stdout ?? '',
		stderr: res.stderr ?? '',
	};
};

const report = (title: string, body: string): void => {
	console.log(`\n=== ${title} ===`);
	console.log(body);
};

const main = (): void => {
	if (BACKUP) {
		const remote = runGit(process.cwd(), ['remote', 'get-url', 'origin']);
		if (!remote.ok) {
			console.error(
				'rewrite-llm-attribution: cannot determine origin URL',
			);
			process.exit(2);
		}
		const url = remote.stdout.trim();
		const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
		const target = join(
			process.cwd(),
			`..`,
			`mcp-vertex-backup-${stamp}.git`,
		);
		console.log(`Cloning mirror to ${target}…`);
		const res = spawnSync('git', ['clone', '--mirror', url, target], {
			encoding: 'utf8',
		});
		if (res.status !== 0) {
			console.error('mirror clone failed:', res.stderr);
			process.exit(1);
		}
		console.log(`Mirror saved at ${target}.`);
		return;
	}

	if (!existsSync('.mailmap')) {
		console.error(
			'rewrite-llm-attribution: no .mailmap at repo root. Run S8a first.',
		);
		process.exit(2);
	}

	// 1) Report: how many commits contain an LLM trailer?
	const log = runGit(process.cwd(), [
		'log',
		'--all',
		'--format=%H%n%B%n---END---',
	]);
	if (log.stdout.length === 0) {
		console.error(
			'git log returned no output:',
			log.stderr || '(no stderr)',
		);
		process.exit(2);
	}
	const commits = log.stdout
		.split('---END---')
		.map((c) => c.trim())
		.filter(Boolean);
	let totalLlmCommits = 0;
	let totalLlmTrailers = 0;
	const sampleCommits: string[] = [];
	for (const c of commits) {
		const lines = c.split('\n');
		const hash = lines[0] ?? '';
		const body = lines.slice(1).join('\n');
		const offending = body.split('\n').filter((l) => trailerIsLlm(l));
		if (offending.length > 0) {
			totalLlmCommits++;
			totalLlmTrailers += offending.length;
			if (sampleCommits.length < 5) {
				sampleCommits.push(
					`  ${hash.slice(0, 12)}: ${offending.length} trailer(s)`,
				);
			}
		}
	}
	report(
		'Trailer scan',
		`Total commits scanned: ${commits.length}\n` +
			`Commits with at least one LLM trailer: ${totalLlmCommits}\n` +
			`Total LLM trailer lines: ${totalLlmTrailers}\n` +
			`Samples (up to 5):\n${sampleCommits.join('\n') || '  (none)'}`,
	);

	// 2) Report: how many unique authors are in .mailmap?
	const mailmapLines = readFileSync('.mailmap', 'utf8')
		.split('\n')
		.filter((l) => l.length > 0 && !l.startsWith('#'));
	report('Mailmap entries', `${mailmapLines.length} non-comment lines`);

	if (!APPLY) {
		console.log(
			'\nDRY RUN complete. Re-run with --apply to perform the rewrite.\n' +
				'DO NOT --apply without first running --backup and reading docs/mcp-vertex/wiki/git-history-rewrite.md.\n',
		);
		return;
	}

	// 3) Apply the rewrite.
	// Strategy: write a Python file that drives `git filter-repo` to:
	//   (a) apply .mailmap for author rewriting
	//   (b) remove every line that matches the LLM trailer pattern
	// If filter-repo is unavailable, fall back to `git filter-branch`
	// with --msg-filter and a simpler mailmap-rewrite.
	console.log('Applying rewrite…');
	const frCheck = runGit(process.cwd(), ['--version']);
	if (frCheck.ok) {
		// Generate a small filter-repo callback
		const callback = join(process.cwd(), '.rewrite-filter.py');
		const script = `#!/usr/bin/env python3
"""git-filter-repo callback for f00500 S8b."""
import re
PHRASES = ${JSON.stringify(LLM_PHRASES.map((p) => [...p]))}
DOMAINS = ${JSON.stringify(LLM_DOMAINS)}

def tokenize(s):
    return [t for t in re.split(r'[^a-z0-9]+', s.lower()) if t]

def is_llm_line(line):
    m = re.match(r'^[A-Za-z][\\w-]*\\s*:\\s*(.+)$', line)
    if not m:
        return False
    value = re.sub(r'[<>"\\'\\\`]+', ' ', m.group(1)).strip()
    tokens = tokenize(value)
    for phrase in PHRASES:
        for i in range(len(tokens) - len(phrase) + 1):
            if tokens[i:i+len(phrase)] == phrase:
                return True
    for d in DOMAINS:
        if re.search(r'(?:^|[^a-z0-9])@?' + re.escape(d), value, re.IGNORECASE):
            return True
    return False

def filter_message(message):
    if not message:
        return message
    out = []
    for line in message.split('\\n'):
        if not is_llm_line(line):
            out.append(line)
    return '\\n'.join(out).rstrip() + '\\n'
`;
		writeFileSync(callback, script, 'utf8');
		const fr = spawnSync(
			'git',
			[
				'filter-repo',
				'--force',
				'--mailmap',
				'.mailmap',
				'--message-callback',
				`cat > /tmp/msg-filter-input; python3 ${callback} < /tmp/msg-filter-input`,
			],
			{ encoding: 'utf8' },
		);
		if (fr.status !== 0) {
			console.error('filter-repo failed:', fr.stderr);
			process.exit(1);
		}
		rmSync(callback, { force: true });
	} else {
		// Fallback: git filter-branch with --msg-filter
		console.warn(
			'git-filter-repo not available; using git filter-branch (slower).',
		);
		const fb = spawnSync(
			'git',
			[
				'filter-branch',
				'-f',
				'--msg-filter',
				`cat > /tmp/msg; node -e "
const phrases = ${JSON.stringify(LLM_PHRASES.map((p) => [...p]))};
const domains = ${JSON.stringify(LLM_DOMAINS)};
const text = require('fs').readFileSync('/tmp/msg', 'utf8');
const out = text.split('\\n').filter(l => {
  const m = l.match(/^[A-Za-z][\\w-]*\\s*:\\s*(.+)$/);
  if (!m) return true;
  const val = m[1].replace(/[<>\\"\\'\\\`]+/g, ' ').trim();
  const tokens = val.toLowerCase().split(/[^a-z0-9]+/).filter(t => t);
  for (const p of phrases) for (let i=0;i+ p.length<=tokens.length;i++) if (tokens.slice(i,i+p.length).join(' ')===p.join(' ')) return false;
  for (const d of domains) if (new RegExp('(?:^|[^a-z0-9])@?' + d.replace(/\\\\./g,'\\\\\\\\.'),'i').test(val)) return false;
  return true;
});
process.stdout.write(out.join('\\n').replace(/\\n+$/,'') + '\\n');
";`,
				'--',
				'--all',
			],
			{ encoding: 'utf8' },
		);
		if (fb.status !== 0) {
			console.error('filter-branch failed:', fb.stderr);
			process.exit(1);
		}
	}

	console.log(
		'Rewrite complete.\n' +
			"Verification: git log --all --format='%B' | grep -ciE 'co-authored-by:.*(claude|minimax|gpt-?[3-9]|gemini|codex|llama|mistral|qwen|deepseek|chatgpt|grok)' should now be 0.\n" +
			'Coordinate force-push with collaborators. Leave refs/original/* intact for 30 days.',
	);
};

main();
