/**
 * check-env.ts — parse a `.env` file and flag common problems as normalized
 * findings: duplicate keys, empty values, malformed lines, and missing
 * required keys. Pure; never leaks a value (only key names are reported).
 */
import type { IFinding } from '@delendai/core/public';

import type { IEnvSchema } from '../validate/env-schema';
import { checkSchema } from '../validate/check-schema';

import type {
	IEnvEntry,
	IEnvScanDeps,
	IParsedEnv,
} from '../contracts/interfaces/env.interface';

/** `KEY=VALUE` — a dotenv assignment (optional leading `export`). */
const ASSIGN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/** Parse dotenv text into entries + malformed line numbers. Pure. */
export const parseEnv = (content: string): IParsedEnv => {
	const entries: IEnvEntry[] = [];
	const malformedLines: number[] = [];
	const lines = content.split('\n');
	for (let index = 0; index < lines.length; index += 1) {
		const raw = lines[index] ?? '';
		const trimmed = raw.trim();
		if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
		const match = ASSIGN.exec(raw);
		if (match === null) {
			malformedLines.push(index + 1);
			continue;
		}
		const value = (match[2] ?? '').trim();
		entries.push({
			key: match[1] ?? '',
			line: index + 1,
			value,
			empty: value === '' || value === '""' || value === "''",
		});
	}
	return { entries, malformedLines };
};

/**
 * Validate parsed env text → findings. `required` names that are absent are
 * flagged high; duplicates medium; empties + malformed low. Values are never
 * included. Pure.
 */
export const checkEnv = (
	content: string,
	required: readonly string[] = [],
): IFinding[] => {
	const { entries, malformedLines } = parseEnv(content);
	const findings: IFinding[] = [];
	const seen = new Map<string, number>();
	for (const entry of entries) {
		const prior = seen.get(entry.key);
		if (prior !== undefined) {
			findings.push({
				ruleId: 'duplicate-key',
				severity: 'medium',
				message: `${entry.key} is defined more than once (first at line ${prior})`,
				location: { file: '.env', line: entry.line },
				fix: 'Remove the duplicate assignment; the last one wins at runtime.',
			});
		} else {
			seen.set(entry.key, entry.line);
		}
		if (entry.empty) {
			findings.push({
				ruleId: 'empty-value',
				severity: 'low',
				message: `${entry.key} has an empty value`,
				location: { file: '.env', line: entry.line },
			});
		}
	}
	for (const line of malformedLines) {
		findings.push({
			ruleId: 'malformed-line',
			severity: 'low',
			message: 'line is not a comment and not a KEY=VALUE assignment',
			location: { file: '.env', line },
		});
	}
	for (const name of required) {
		if (!seen.has(name)) {
			findings.push({
				ruleId: 'missing-required',
				severity: 'high',
				message: `required variable ${name} is not set`,
				location: { file: '.env' },
				fix: `Add ${name}=<value> to .env (or the environment).`,
			});
		}
	}
	return findings;
};

/** Run the env check over the file at `path`, or report a skipped scan. */
export const runEnvCheck = async (
	deps: IEnvScanDeps,
	path: string,
	required: readonly string[] = [],
): Promise<{ found: boolean; findings: readonly IFinding[] }> => {
	const content = await deps.readEnv(path);
	if (content === undefined) return { found: false, findings: [] };
	return { found: true, findings: checkEnv(content, required) };
};

/** Same as `runEnvCheck`, but additionally diffs the parsed env against a declared schema. */
export const runEnvCheckWithSchema = async (
	deps: IEnvScanDeps,
	path: string,
	required: readonly string[],
	schema: IEnvSchema,
): Promise<{ found: boolean; findings: readonly IFinding[] }> => {
	const content = await deps.readEnv(path);
	if (content === undefined) return { found: false, findings: [] };
	const parsed = parseEnv(content);
	const findings = [
		...checkEnv(content, required),
		...checkSchema(parsed, schema),
	];
	return { found: true, findings };
};
