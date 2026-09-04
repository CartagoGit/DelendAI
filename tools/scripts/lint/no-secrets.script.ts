/**
 * no-secrets.script.ts — refuse to commit or push a credential.
 *
 * On 2026-09-03 GitHub's push protection blocked develop over a
 * `sk_live_…`-shaped string. It was a fabricated fixture in a test about
 * NOT persisting secrets, and it was harmless — but it was found by a
 * server, after ten commits had already been written, and purging it
 * cost a history rewrite that this sandbox is not allowed to perform.
 *
 * The repo already knew what a credential looks like: that knowledge
 * lived in `redactSecrets`, and nothing consulted it before writing a
 * commit. This gate closes that gap locally, where the fix is still one
 * edit instead of a rebase.
 *
 * Modes:
 *   (default)         scan the STAGED diff        — pre-commit
 *   --range A..B      scan the diff of a range    — pre-push
 *   --all             scan every tracked file     — validate / CI
 *   --fix             NEUTRALISE instead of refusing (see below)
 *
 * `--fix` is how the pre-commit hook runs it. Refusing the commit leaves
 * the credential sitting in the working tree, one `--no-verify` away
 * from the remote and still readable by anything that reads the repo.
 * Replacing it removes the value at the only moment we are certain to
 * be looking at it. The placeholder is deliberately loud and greppable
 *
 *     MCPV_REDACTED_SECRET_STRIPE_KEY
 *
 * so that a human, and equally an agent reading the file later, can see
 * that a real value stood here, that mcp-vertex removed it because it
 * was credential-shaped, and that it must not be restored — rather than
 * finding an empty string and "fixing" it back.
 *
 * Only ADDED lines are scanned in diff modes: a secret already in
 * history is a separate (and worse) problem, and re-reporting it on
 * every unrelated commit would make the gate noise the first thing
 * anyone silences.
 *
 * The gate uses `HIGH_CONFIDENCE_SECRET_PATTERNS` only — patterns that
 * match an issuer's own prefix or structure. The heuristic
 * `token = <value>` rules stay out: they are right for redacting a log
 * and wrong for blocking a commit, and a gate that cries wolf is a gate
 * that gets bypassed.
 *
 * Escape hatch: put `mcpv-allow-secret` in a comment on the same line.
 * Deliberate, visible, and reviewable in the diff — unlike a bypass
 * env var, which leaves no trace of what was waved through.
 *
 * NOT the same gate as `lint:no-cleartext-secrets`, which asks a
 * different question of a different corpus: it reads tracked
 * `*.config.json` files and flags a secret-ish FIELD NAME whose value is
 * not an env reference. It would pass a `sk_live_…` literal sitting in a
 * `.ts` fixture, which is exactly what got through. This one asks
 * whether any added line anywhere contains something SHAPED like a
 * credential. Keep both.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { HIGH_CONFIDENCE_SECRET_PATTERNS } from '@delendai/core/public';

const exec = promisify(execFile);

const ALLOW_MARKER = 'mcpv-allow-secret';

/**
 * Findings that predate the gate.
 *
 * The security and test-policy plugins keep credential-shaped fixtures
 * on purpose — a scanner needs something to scan. Failing on those would
 * make the gate unadoptable, and a gate nobody can turn on protects
 * nothing. Baselined by `file` + `rule` rather than by line, so the
 * entry survives ordinary edits to the file and only a NEW kind of
 * finding in it fails.
 */
const BASELINE_REL = 'tools/scripts/lint/no-secrets.baseline.json';

export interface ISecretFinding {
	readonly file: string;
	readonly line: number;
	readonly rule: string;
	/** A masked preview. The finding NEVER carries the secret itself. */
	readonly preview: string;
}

/**
 * Show enough to find the line, never enough to use the credential:
 * the first four characters (the issuer prefix, which is the useful
 * part of the report) and nothing else.
 */
/**
 * What replaces a credential in `--fix` mode.
 *
 * Named after the rule that matched, so the placeholder says WHICH kind
 * of credential was here — enough to reconstruct the intent ("a Stripe
 * key went here") without carrying anything usable.
 */
export const redactionPlaceholder = (rule: string): string =>
	`MCPV_REDACTED_SECRET_${rule.toUpperCase().replace(/[^A-Z0-9]+/gu, '_')}`;

export const maskMatch = (match: string): string => {
	const head = match.slice(0, 4);
	return `${head}${'*'.repeat(Math.min(match.length - head.length, 12))} (${String(match.length)} chars)`;
};

/** Scan one file's text. Pure — the caller decides where text came from. */
export const scanText = (
	file: string,
	text: string,
	startLine = 1,
): ISecretFinding[] => {
	const findings: ISecretFinding[] = [];
	const lines = text.split('\n');
	for (const [index, line] of lines.entries()) {
		if (line.includes(ALLOW_MARKER)) continue;
		for (const pattern of HIGH_CONFIDENCE_SECRET_PATTERNS) {
			// The shared patterns carry the `g` flag, whose `lastIndex`
			// persists between calls; a fresh regex per line keeps this
			// from silently skipping every other match.
			const re = new RegExp(pattern.re.source, pattern.re.flags);
			const match = re.exec(line);
			if (match !== null) {
				findings.push({
					file,
					line: startLine + index,
					rule: pattern.name,
					preview: maskMatch(match[0]),
				});
			}
		}
	}
	return findings;
};

/**
 * Added lines of a unified diff, with their real line numbers, so a
 * finding points at the line the author can actually open.
 */
export const scanUnifiedDiff = (diff: string): ISecretFinding[] => {
	const findings: ISecretFinding[] = [];
	let file = '';
	let lineNo = 0;
	for (const line of diff.split('\n')) {
		if (line.startsWith('+++ b/')) {
			file = line.slice('+++ b/'.length);
			continue;
		}
		const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(line);
		if (hunk?.[1] !== undefined) {
			lineNo = Number.parseInt(hunk[1], 10);
			continue;
		}
		if (line.startsWith('+') && !line.startsWith('+++')) {
			findings.push(...scanText(file, line.slice(1), lineNo));
			lineNo += 1;
			continue;
		}
		if (!line.startsWith('-') && !line.startsWith('\\')) lineNo += 1;
	}
	return findings;
};

const gitOut = async (args: readonly string[]): Promise<string> => {
	const { stdout } = await exec('git', [...args], {
		maxBuffer: 64 * 1024 * 1024,
	});
	return stdout;
};

/**
 * Replace every high-confidence match in `text`. Pure, so the caller
 * owns the I/O and the test does not need a filesystem.
 */
export const redactTextInPlace = (
	text: string,
): { readonly text: string; readonly replaced: number } => {
	let replaced = 0;
	const out = text
		.split('\n')
		.map((line) => {
			if (line.includes(ALLOW_MARKER)) return line;
			let current = line;
			for (const pattern of HIGH_CONFIDENCE_SECRET_PATTERNS) {
				const re = new RegExp(pattern.re.source, pattern.re.flags);
				current = current.replace(re, () => {
					replaced += 1;
					return redactionPlaceholder(pattern.name);
				});
			}
			return current;
		})
		.join('\n');
	return { text: out, replaced };
};

const baselineKey = (finding: ISecretFinding): string =>
	`${finding.file}\t${finding.rule}`;

const readBaseline = async (): Promise<Set<string>> => {
	try {
		const { readFile } = await import('node:fs/promises');
		const raw = await readFile(BASELINE_REL, 'utf8');
		const parsed: unknown = JSON.parse(raw);
		return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
	} catch {
		return new Set();
	}
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const rangeIndex = argv.indexOf('--range');
	const all = argv.includes('--all');
	const update = argv.includes('--update');
	const fix = argv.includes('--fix');

	let findings: ISecretFinding[];
	let scope: string;
	if (all) {
		scope = 'every tracked file';
		const files = (await gitOut(['ls-files', '-z']))
			.split('\0')
			.filter((name) => name.length > 0);
		findings = [];
		for (const file of files) {
			let text: string;
			try {
				text = await gitOut(['show', `:${file}`]);
			} catch {
				continue; // unmerged or unreadable — nothing to scan
			}
			findings.push(...scanText(file, text));
		}
	} else if (argv.includes('--push-range')) {
		// Resolve the range HERE rather than through a lefthook `{…}`
		// template. x00159 cost a day to a guard that never fired
		// because lefthook cannot populate a refspec template for a
		// plain `git push`: the placeholder shipped as a literal string
		// and the check silently passed. A script that asks git itself
		// cannot be defeated that way.
		let base = '';
		try {
			base = (
				await gitOut(['rev-parse', '--abbrev-ref', '@{upstream}'])
			).trim();
		} catch {
			base = '';
		}
		if (base === '') {
			// No upstream (a brand-new branch): fall back to the merge
			// base with the integration branch, and if even that is
			// unknown, scan nothing rather than the entire history —
			// `--all` is the gate for history.
			try {
				base = (
					await gitOut(['merge-base', 'HEAD', 'origin/develop'])
				).trim();
			} catch {
				console.log(
					'✓ no-secrets: ok (no upstream to compare against)',
				);
				return 0;
			}
		}
		scope = `range ${base}..HEAD`;
		findings = scanUnifiedDiff(
			await gitOut(['diff', '--unified=0', `${base}..HEAD`]),
		);
	} else if (rangeIndex !== -1 && argv[rangeIndex + 1] !== undefined) {
		const range = argv[rangeIndex + 1] as string;
		scope = `range ${range}`;
		findings = scanUnifiedDiff(
			await gitOut(['diff', '--unified=0', range]),
		);
	} else {
		scope = 'the staged diff';
		findings = scanUnifiedDiff(
			await gitOut(['diff', '--cached', '--unified=0']),
		);
	}

	if (update) {
		const { writeFile } = await import('node:fs/promises');
		const keys = [...new Set(findings.map(baselineKey))].sort();
		await writeFile(BASELINE_REL, `${JSON.stringify(keys, null, '\t')}\n`);
		console.log(
			`no-secrets: baseline updated with ${String(keys.length)} entr(ies)`,
		);
		return 0;
	}

	if (fix && findings.length > 0) {
		const baselineForFix = await readBaseline();
		const touched = [
			...new Set(
				findings
					.filter(
						(finding) => !baselineForFix.has(baselineKey(finding)),
					)
					.map((finding) => finding.file),
			),
		];
		if (touched.length === 0) {
			console.log('✓ no-secrets: ok (only baselined fixtures)');
			return 0;
		}
		const { readFile, writeFile } = await import('node:fs/promises');
		let total = 0;
		for (const file of touched) {
			let text: string;
			try {
				text = await readFile(file, 'utf8');
			} catch {
				continue;
			}
			const result = redactTextInPlace(text);
			if (result.replaced === 0) continue;
			await writeFile(file, result.text);
			total += result.replaced;
			console.error(
				`  neutralised ${String(result.replaced)} credential(s) in ${file}`,
			);
			await exec('git', ['add', '--', file]).catch(() => undefined);
		}
		console.error(
			`✖ no-secrets: ${String(total)} credential-shaped string(s) were REPLACED, not committed.`,
		);
		console.error('');
		console.error(
			'  Each now reads MCPV_REDACTED_SECRET_<KIND>. That is not a value to',
		);
		console.error(
			'  restore: a real credential stood there and mcp-vertex removed it before',
		);
		console.error(
			'  it could reach a commit, a push, or an issue. If the line only needed',
		);
		console.error(
			'  the SHAPE of a key, assemble it at runtime; if it needed a real one,',
		);
		console.error(
			'  read it from the environment. The edits are staged — review them.',
		);
		return total > 0 ? 1 : 0;
	}

	const baseline = await readBaseline();
	const before = findings.length;
	findings = findings.filter(
		(finding) => !baseline.has(baselineKey(finding)),
	);
	const baselined = before - findings.length;

	if (findings.length === 0) {
		console.log(
			`✓ no-secrets: ok (${scope}${baselined > 0 ? `, ${String(baselined)} baselined` : ''})`,
		);
		return 0;
	}

	console.error(
		`✖ no-secrets: ${String(findings.length)} credential-shaped string(s) in ${scope}`,
	);
	for (const finding of findings) {
		console.error(
			`  ${finding.file}:${String(finding.line)}  [${finding.rule}]  ${finding.preview}`,
		);
	}
	console.error('');
	console.error(
		'  A credential must never reach a commit: rewriting it out of history',
	);
	console.error(
		'  afterwards is far more expensive than editing it now. Remove the value,',
	);
	console.error(
		'  or — for a fixture that only needs the SHAPE — assemble it at runtime',
	);
	console.error(
		"  (`['sk', 'live', body].join('_')`), which keeps the coverage and checks in",
	);
	console.error(
		`  nothing key-shaped. A deliberate literal needs \`${ALLOW_MARKER}\` on the line.`,
	);
	return 1;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
