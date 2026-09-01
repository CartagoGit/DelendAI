import { DATE_PREFIX_LENGTH } from '../contracts/constants/audit.constant';

const DATE_PREFIX = /^\d{2}-\d{2}-\d{4}$/u;
const WHITESPACE_CHAR = /\s/u;
const MARKDOWN_BOLD_DELIMITER = '**';
const MARKDOWN_LABEL_PREFIX_OFFSET = 2;
const FILE_LABEL_SUFFIX_CHAR_COUNT = 1;

export const isWhitespaceChar = (char: string | undefined): boolean =>
	char !== undefined && WHITESPACE_CHAR.test(char);

export const isLevelTwoHeading = (line: string): boolean =>
	line.startsWith('##') && isWhitespaceChar(line[2]);

const trimTrailingColons = (value: string): string => {
	let end = value.length;
	while (end > 0 && value[end - 1] === ':') end -= 1;
	return value.slice(0, end);
};

export const stripMarkdownBold = (value: string): string => {
	let start = 0;
	let end = value.length;
	if (value.startsWith(MARKDOWN_BOLD_DELIMITER)) {
		start = MARKDOWN_LABEL_PREFIX_OFFSET;
		while (start < end && isWhitespaceChar(value[start])) start += 1;
	}
	while (end > start && isWhitespaceChar(value[end - 1])) end -= 1;
	if (
		end - start >= MARKDOWN_LABEL_PREFIX_OFFSET &&
		value.slice(end - MARKDOWN_LABEL_PREFIX_OFFSET, end) ===
			MARKDOWN_BOLD_DELIMITER
	) {
		end -= MARKDOWN_LABEL_PREFIX_OFFSET;
		while (end > start && isWhitespaceChar(value[end - 1])) end -= 1;
	}
	return value.slice(start, end).trim();
};

const isFileLabel = (value: string): boolean => {
	const normalized = value.toLowerCase();
	if (
		normalized === 'archivo' ||
		normalized === 'archivos' ||
		normalized === 'file' ||
		normalized === 'files' ||
		normalized === 'fichero'
	) {
		return true;
	}
	return (
		normalized.startsWith('fichero') &&
		normalized.length === 'fichero'.length + FILE_LABEL_SUFFIX_CHAR_COUNT &&
		(normalized.at(-1) ?? '') >= 'a' &&
		(normalized.at(-1) ?? '') <= 'z'
	);
};

export const extractTextAfterFileLabel = (line: string): string | undefined => {
	if (!line.startsWith(MARKDOWN_BOLD_DELIMITER)) return undefined;
	const labelEnd = line.indexOf(
		MARKDOWN_BOLD_DELIMITER,
		MARKDOWN_LABEL_PREFIX_OFFSET,
	);
	if (labelEnd === -1) return undefined;
	const label = trimTrailingColons(
		line.slice(MARKDOWN_LABEL_PREFIX_OFFSET, labelEnd).trim(),
	);
	if (!isFileLabel(label)) return undefined;
	let index = labelEnd + MARKDOWN_LABEL_PREFIX_OFFSET;
	while (
		index < line.length &&
		(line[index] === ':' || isWhitespaceChar(line[index]))
	) {
		index += 1;
	}
	return line.slice(index);
};

export const parseConventionalSource = (
	value: string,
): { date: string; head: string; model: string } | undefined => {
	const date = value.slice(0, DATE_PREFIX_LENGTH);
	if (!DATE_PREFIX.test(date)) return undefined;
	let index = DATE_PREFIX_LENGTH;
	const separatorStart = index;
	while (index < value.length) {
		const char = value[index];
		if (char !== '-' && !isWhitespaceChar(char)) break;
		index += 1;
	}
	if (index === separatorStart) return undefined;

	let remainder = value.slice(index);
	const lower = remainder.toLowerCase();
	for (const prefix of ['auditoría', 'auditoria']) {
		if (!lower.startsWith(prefix)) continue;
		let prefixEnd = prefix.length;
		while (
			prefixEnd < remainder.length &&
			isWhitespaceChar(remainder[prefixEnd])
		) {
			prefixEnd += 1;
		}
		if (prefixEnd > prefix.length) remainder = remainder.slice(prefixEnd);
		break;
	}

	const openParen = remainder.indexOf('(');
	if (openParen === -1) return undefined;
	const closeParen = remainder.indexOf(')', openParen + 1);
	if (closeParen <= openParen + 1) return undefined;
	return {
		date,
		head: remainder.slice(0, openParen),
		model: remainder.slice(openParen + 1, closeParen),
	};
};

export const isExecutiveSummaryHeading = (line: string): boolean => {
	if (!isLevelTwoHeading(line)) return false;
	const lower = line.toLowerCase();
	return (
		lower.includes('resumen') ||
		lower.includes('summary') ||
		lower.includes('executive')
	);
};
