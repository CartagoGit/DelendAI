/**
 * check-i18n.ts — cross-locale consistency: flag keys present in some locales
 * but missing in others, and interpolation-placeholder mismatches between
 * locales for the same key. Pure over the parsed locale files.
 */
import type { IFinding } from '@delendai/core/public';

import type { ILocaleFile } from '../contracts/interfaces/i18n.interface';

/** Flatten a (possibly nested) message object into `a.b.c → value` pairs. */
export const flattenKeys = (
	obj: Record<string, unknown>,
	prefix = '',
): Record<string, string> => {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(obj)) {
		const path = prefix === '' ? key : `${prefix}.${key}`;
		if (
			value !== null &&
			typeof value === 'object' &&
			!Array.isArray(value)
		) {
			Object.assign(
				out,
				flattenKeys(value as Record<string, unknown>, path),
			);
		} else {
			out[path] = typeof value === 'string' ? value : String(value);
		}
	}
	return out;
};

/** `{name}`, `{{name}}`, `%s`, `{0}` — the common interpolation shapes. */
const PLACEHOLDER = /\{\{?\s*[\w.]+\s*\}?\}|%[sdif]|\{\d+\}/g;

const placeholdersOf = (value: string): Set<string> =>
	new Set(
		(value.match(PLACEHOLDER) ?? []).map((token) =>
			token.replace(/\s+/g, ''),
		),
	);

const sameSet = (a: Set<string>, b: Set<string>): boolean =>
	a.size === b.size && [...a].every((item) => b.has(item));

export interface ICheckLocalesOptions {
	readonly usedKeys?: Iterable<string>;
}

/**
 * Check a set of locale files for consistency:
 *   - `missing-key` (medium): a key some locale has that this one lacks.
 *   - `placeholder-mismatch` (medium): the same key's interpolation
 *     placeholders differ between locales.
 * Pure; deterministic (keys + locales are sorted).
 */
export const checkLocales = (
	locales: readonly ILocaleFile[],
	options: ICheckLocalesOptions = {},
): IFinding[] => {
	const flat = locales
		.map((locale) => ({
			locale: locale.locale,
			keys: flattenKeys(locale.data),
		}))
		.sort((a, b) => a.locale.localeCompare(b.locale));
	const allKeys = [
		...new Set(flat.flatMap((entry) => Object.keys(entry.keys))),
	].sort();
	const findings: IFinding[] = [];

	for (const entry of flat) {
		for (const key of allKeys) {
			if (!(key in entry.keys)) {
				findings.push({
					ruleId: 'missing-key',
					severity: 'medium',
					message: `${entry.locale}: missing key "${key}"`,
					location: { file: entry.locale },
					fix: `Add "${key}" to the ${entry.locale} locale.`,
				});
			}
		}
	}

	for (const key of allKeys) {
		const havers = flat.filter((entry) => key in entry.keys);
		if (havers.length < 2) continue;
		const first = havers[0];
		if (first === undefined) continue;
		const reference = placeholdersOf(first.keys[key] ?? '');
		for (const entry of havers.slice(1)) {
			const current = placeholdersOf(entry.keys[key] ?? '');
			if (!sameSet(reference, current)) {
				findings.push({
					ruleId: 'placeholder-mismatch',
					severity: 'medium',
					message: `${entry.locale}: key "${key}" has different interpolation placeholders than ${first.locale}`,
					location: { file: entry.locale },
					fix: 'Align the placeholders so every locale interpolates the same variables.',
				});
			}
		}
	}

	const usedKeys = options.usedKeys
		? new Set([...options.usedKeys].filter((key) => key.length > 0))
		: undefined;
	if (usedKeys !== undefined && usedKeys.size > 0) {
		for (const entry of flat) {
			for (const key of Object.keys(entry.keys).sort()) {
				if (usedKeys.has(key)) continue;
				findings.push({
					ruleId: 'unused-key',
					severity: 'low',
					message: `${entry.locale}: key "${key}" is not referenced by the scanned source files`,
					location: { file: entry.locale },
					fix: `Remove "${key}" from ${entry.locale} or add a matching usage in source.`,
				});
			}
		}
	}
	return findings;
};
