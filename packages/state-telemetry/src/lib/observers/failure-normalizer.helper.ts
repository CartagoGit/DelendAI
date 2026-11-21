/**
 * failure-normalizer.helper.ts — turns a failure message into a stable
 * string so two runs that fail for the same cause hash equal. Shared by
 * the test and the tool observers.
 */

import { FAILURE_VOLATILE_PLACEHOLDER } from './contracts/constants/observer.constant';
import type { IFailureNormalizeOptions } from './contracts/interfaces/observer.interface';

// ESC [ ... final byte: the colour and cursor sequences terminals emit.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ESC is the point
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const ISO_TIMESTAMP =
	/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const DURATION = /\b\d+(?:\.\d+)?\s?(?:ms|s|sec|seconds|m)\b/g;
const LINE_COL = /:\d+(?::\d+)?(?=[\s)\]]|$)/g;

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const normalizeFailureMessage = (
	message: string,
	options: IFailureNormalizeOptions = {},
): string => {
	const root = (options.rootDir ?? process.cwd()).replace(/\/+$/, '');
	let text = message
		.replace(ANSI, '')
		.replace(ISO_TIMESTAMP, FAILURE_VOLATILE_PLACEHOLDER);
	if (root.length > 0) {
		text = text.replace(new RegExp(`${escapeRegExp(root)}/?`, 'g'), '');
	}
	return text
		.replace(LINE_COL, '')
		.replace(DURATION, FAILURE_VOLATILE_PLACEHOLDER)
		.replace(/\s+/g, ' ')
		.trim();
};
