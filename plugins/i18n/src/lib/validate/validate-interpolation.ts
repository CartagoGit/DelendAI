import type { IFinding } from '@delendai/core/public';

import type { ILocaleFile } from '../contracts/interfaces/i18n.interface';
import { flattenKeys } from '../i18n/check-i18n';

const DOUBLE_BRACE = /^\{\{\s*([\w.]+)\s*\}\}/;
const PRINTF = /^%[sdif]/;
const ICU_KINDS = new Set(['plural', 'select', 'selectordinal']);

interface IMessageAnalysis {
	readonly placeholders: ReadonlySet<string>;
	readonly malformed: boolean;
}

const splitTopLevelComma = (content: string): string[] => {
	const parts: string[] = [];
	let depth = 0;
	let current = '';
	for (const char of content) {
		if (char === '{') depth += 1;
		if (char === '}') depth -= 1;
		if (char === ',' && depth === 0) {
			parts.push(current.trim());
			current = '';
			continue;
		}
		current += char;
	}
	parts.push(current.trim());
	return parts;
};

const parseBraceBlock = (
	value: string,
	start: number,
): { readonly end: number; readonly content: string } | undefined => {
	let depth = 0;
	for (let index = start; index < value.length; index += 1) {
		const char = value[index];
		if (char === '{') depth += 1;
		if (char === '}') {
			depth -= 1;
			if (depth === 0) {
				return {
					end: index,
					content: value.slice(start + 1, index),
				};
			}
			if (depth < 0) return undefined;
		}
	}
	return undefined;
};

const parseIcuOptions = (input: string): boolean => {
	const options = new Set<string>();
	let index = 0;
	while (index < input.length) {
		while (index < input.length && /\s/.test(input[index] ?? ''))
			index += 1;
		if (index >= input.length) break;
		const start = index;
		while (index < input.length && /[=\w-]/.test(input[index] ?? '')) {
			index += 1;
		}
		const selector = input.slice(start, index).trim();
		if (selector.length === 0) return false;
		while (index < input.length && /\s/.test(input[index] ?? ''))
			index += 1;
		if (input[index] !== '{') return false;
		const block = parseBraceBlock(input, index);
		if (block === undefined) return false;
		options.add(selector);
		index = block.end + 1;
	}
	return options.size > 0 && options.has('other');
};

const normalizeBraceToken = (
	content: string,
): { readonly token?: string; readonly malformed: boolean } => {
	if (/^\s*\d+\s*$/.test(content)) {
		return { token: `{${content.trim()}}`, malformed: false };
	}
	if (/^\s*[\w.]+\s*$/.test(content)) {
		return { token: `{${content.trim()}}`, malformed: false };
	}
	const parts = splitTopLevelComma(content);
	if (parts.length < 2) return { malformed: false };
	const variable = parts[0] ?? '';
	const kind = parts[1] ?? '';
	if (!/^\w[\w.]*$/.test(variable) || !/^\w+$/.test(kind)) {
		return { malformed: true };
	}
	if (ICU_KINDS.has(kind)) {
		const options = parts.slice(2).join(',').trim();
		if (options.length === 0 || !parseIcuOptions(options)) {
			return { malformed: true };
		}
	}
	return { token: `{${variable},${kind}}`, malformed: false };
};

const analyzeMessage = (value: string): IMessageAnalysis => {
	const placeholders = new Set<string>();
	let malformed = false;
	let index = 0;
	while (index < value.length) {
		const rest = value.slice(index);
		const doubleBrace = rest.match(DOUBLE_BRACE);
		if (doubleBrace?.[1] !== undefined) {
			placeholders.add(`{{${doubleBrace[1]}}}`);
			index += doubleBrace[0].length;
			continue;
		}
		const printf = rest.match(PRINTF);
		if (printf?.[0] !== undefined) {
			placeholders.add(printf[0]);
			index += printf[0].length;
			continue;
		}
		const char = value[index];
		if (char === '}') {
			malformed = true;
			index += 1;
			continue;
		}
		if (char !== '{') {
			index += 1;
			continue;
		}
		const block = parseBraceBlock(value, index);
		if (block === undefined) {
			malformed = true;
			break;
		}
		const normalized = normalizeBraceToken(block.content);
		if (normalized.malformed) malformed = true;
		if (normalized.token !== undefined) placeholders.add(normalized.token);
		index = block.end + 1;
	}
	return { placeholders, malformed };
};

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
	a.size === b.size && [...a].every((item) => b.has(item));

/**
 * Validate interpolation / ICU consistency across locale files.
 * The source-of-truth locale is `en` when present, otherwise the first locale
 * in sorted order.
 */
export const validateInterpolation = (
	locales: readonly ILocaleFile[],
): IFinding[] => {
	const flat = locales
		.map((locale) => ({
			locale: locale.locale,
			keys: flattenKeys(locale.data),
		}))
		.sort((a, b) => a.locale.localeCompare(b.locale));
	const reference = flat.find((entry) => entry.locale === 'en') ?? flat[0];
	if (reference === undefined) return [];
	const findings: IFinding[] = [];

	for (const entry of flat) {
		for (const [key, message] of Object.entries(entry.keys).sort(
			([a], [b]) => a.localeCompare(b),
		)) {
			const analysis = analyzeMessage(message);
			if (!analysis.malformed) continue;
			findings.push({
				ruleId: 'malformed-icu',
				severity: 'high',
				message: `${entry.locale}: key "${key}" contains malformed ICU/interpolation syntax`,
				location: { file: entry.locale },
				fix: 'Balance braces and close every ICU plural/select branch.',
			});
		}
	}

	for (const entry of flat) {
		if (entry.locale === reference.locale) continue;
		for (const key of Object.keys(entry.keys).sort()) {
			if (key in reference.keys) continue;
			findings.push({
				ruleId: 'extra-locale',
				severity: 'low',
				message: `${entry.locale}: key "${key}" exists here but not in source locale ${reference.locale}`,
				location: { file: entry.locale },
				fix: `Remove "${key}" from ${entry.locale} or add it to ${reference.locale}.`,
			});
		}
	}

	for (const [key, referenceMessage] of Object.entries(reference.keys).sort(
		([a], [b]) => a.localeCompare(b),
	)) {
		const referenceAnalysis = analyzeMessage(referenceMessage);
		for (const entry of flat) {
			if (entry.locale === reference.locale) continue;
			const currentMessage = entry.keys[key];
			if (currentMessage === undefined) continue;
			const currentAnalysis = analyzeMessage(currentMessage);
			if (currentAnalysis.malformed || referenceAnalysis.malformed)
				continue;
			if (
				sameSet(
					referenceAnalysis.placeholders,
					currentAnalysis.placeholders,
				)
			) {
				continue;
			}
			findings.push({
				ruleId: 'placeholder-mismatch',
				severity: 'medium',
				message: `${entry.locale}: key "${key}" has different placeholders than ${reference.locale}`,
				location: { file: entry.locale },
				fix: 'Align interpolation variables and ICU selector kinds across locales.',
			});
		}
	}

	return findings;
};
