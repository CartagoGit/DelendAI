#!/usr/bin/env bun
/**
 * no-cleartext-secrets.script.ts — f00067 S8 (secrets posture gate).
 *
 * A secret must NEVER be committed in cleartext to a config file. The repo's
 * own convention (and the `providers` roster f00067 introduces) declares only
 * ENV-VAR references — `"apiKey": "${OPENAI_API_KEY}"` or an env-var NAME the
 * runtime reads (`"envVar": "OPENAI_API_KEY"`) — never the literal key.
 *
 * This gate walks every tracked `delendai.config.json` / `*.config.json`
 * under the workspace (EXCLUDING test fixtures and the `docs/delendai/
 * examples/**` sample configs) and fails if it finds a field whose NAME ends in
 * a secret-ish word (`api[_-]?key`, `secret`, `token`, `password`, `passwd`,
 * `pwd`, `access[_-]?key`, `client[_-]?secret`) AND whose string VALUE is
 * neither a `${ENV_VAR}` reference nor a bare `ENV_VAR` name. It is the
 * write-time complement to `redactSecrets` (which scrubs secrets out of durable
 * stores): this stops a cleartext key from ever landing in versioned config.
 *
 * Precision over recall: the key match is anchored to the END of the field name
 * (so `keywords`, `maxTokens`, `tokenBudget` are NOT flagged) and env-var
 * references / names are treated as safe, so a well-formed config never trips.
 *
 * Exit codes:
 *   0 — no cleartext secrets in any scanned config.
 *   1 — one or more cleartext secret-ish values found.
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

/** A field whose name ends in a secret-ish word (boundary-anchored). */
const SECRET_KEY_RE =
	/(?:^|[_-])(?:api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|client[_-]?secret)$/i;

/** `${OPENAI_API_KEY}` — an interpolated env reference. */
const ENV_REF_RE = /^\$\{[A-Z0-9_]+\}$/;
/** `OPENAI_API_KEY` — a bare env-var NAME the runtime reads (reference by name). */
const ENV_NAME_RE = /^[A-Z][A-Z0-9_]{2,}$/;

/** Directories/globs whose configs are samples or fixtures, not real secrets. */
const EXCLUDE_RE =
	/(?:^|\/)(?:tests?|__tests__|fixtures)(?:\/|$)|^docs\/delendai\/examples\//;

export interface ICleartextFinding {
	readonly file: string;
	/** Dotted path to the offending field. */
	readonly path: string;
	readonly key: string;
}

/** A value is safe when it is empty, an `${ENV}` ref, or a bare `ENV_NAME`. */
const isSafeValue = (value: string): boolean =>
	value.length === 0 || ENV_REF_RE.test(value) || ENV_NAME_RE.test(value);

/**
 * Walk a parsed config value and collect every secret-ish field whose string
 * value is a cleartext literal. Pure over its input.
 */
export const findCleartextSecrets = (
	root: unknown,
	file: string,
): ICleartextFinding[] => {
	const out: ICleartextFinding[] = [];
	const walk = (node: unknown, path: string): void => {
		if (Array.isArray(node)) {
			for (let i = 0; i < node.length; i++) {
				walk(node[i], `${path}[${i}]`);
			}
			return;
		}
		if (node === null || typeof node !== 'object') return;
		for (const [key, value] of Object.entries(node)) {
			const childPath = path === '' ? key : `${path}.${key}`;
			if (
				SECRET_KEY_RE.test(key) &&
				typeof value === 'string' &&
				!isSafeValue(value)
			) {
				out.push({ file, path: childPath, key });
			}
			walk(value, childPath);
		}
	};
	walk(root, '');
	return out;
};

/** Tracked `*.config.json` / `delendai.config.json`, sans fixtures/examples. */
export const collectConfigFiles = (root: string): string[] => {
	const raw = execFileSync(
		'git',
		['ls-files', 'delendai.config.json', '*.config.json'],
		{ cwd: root, encoding: 'utf8' },
	);
	return [
		...new Set(
			raw
				.split('\n')
				.map((l) => l.trim())
				.filter(Boolean),
		),
	]
		.filter((rel) => !EXCLUDE_RE.test(rel))
		.sort();
};

if (import.meta.main) {
	void (async () => {
		const root = repoRoot();
		const files = collectConfigFiles(root);
		const findings: ICleartextFinding[] = [];
		for (const rel of files) {
			const raw = await readFile(join(root, rel), 'utf8').catch(
				() => null,
			);
			if (raw === null) continue;
			let parsed: unknown;
			try {
				parsed = JSON.parse(raw);
			} catch {
				continue; // not strict JSON (comments etc.) → skip
			}
			findings.push(...findCleartextSecrets(parsed, rel));
		}
		if (findings.length > 0) {
			console.error(
				`✖ no-cleartext-secrets: ${findings.length} cleartext secret-ish value(s) in config — use a \${ENV_VAR} reference instead:`,
			);
			for (const f of findings) {
				console.error(`  ${f.file}: ${f.path} (field "${f.key}")`);
			}
			process.exit(1);
			return;
		}
		console.log(
			`✓ no-cleartext-secrets: ${files.length} config file(s) checked, 0 cleartext secrets.`,
		);
	})();
}
