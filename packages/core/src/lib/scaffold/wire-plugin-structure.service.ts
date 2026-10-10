import type {
	IPluginWiringEdit,
	IWirePluginOptions,
} from '../contracts/interfaces/plugin-wiring.interface';
import { validateStructuredText } from './scaffold-text-structure.service';

export const escapeRegex = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export const commitWiringEdit = async (
	options: IWirePluginOptions,
	path: string,
	previous: string,
	next: string,
	noop: boolean,
): Promise<IPluginWiringEdit> => {
	if (!noop) {
		validateStructuredText(path, next);
		if (options.dryRun !== true) {
			await options.fs.writeFile(path, next);
		}
	}
	return { path, previous, next, noop };
};

const findLeadingIndent = (text: string, position: number): string => {
	const lineStart = text.lastIndexOf('\n', position - 1) + 1;
	const indentMatch = /^[\t ]*/u.exec(text.slice(lineStart));
	return indentMatch?.[0] ?? '';
};

const findMatchingDelimiter = (
	text: string,
	openIndex: number,
	openChar: '{' | '[' | '(',
	closeChar: '}' | ']' | ')',
): number => {
	let depth = 0;
	let mode:
		| 'normal'
		| 'single-quote'
		| 'double-quote'
		| 'template'
		| 'line-comment'
		| 'block-comment' = 'normal';
	let escaped = false;
	for (let index = openIndex; index < text.length; index += 1) {
		const char = text[index];
		const next = text[index + 1];
		if (mode === 'line-comment') {
			if (char === '\n') mode = 'normal';
			continue;
		}
		if (mode === 'block-comment') {
			if (char === '*' && next === '/') {
				mode = 'normal';
				index += 1;
			}
			continue;
		}
		if (mode === 'single-quote') {
			if (!escaped && char === '\\') {
				escaped = true;
				continue;
			}
			if (!escaped && char === "'") mode = 'normal';
			escaped = false;
			continue;
		}
		if (mode === 'double-quote') {
			if (!escaped && char === '\\') {
				escaped = true;
				continue;
			}
			if (!escaped && char === '"') mode = 'normal';
			escaped = false;
			continue;
		}
		if (mode === 'template') {
			if (!escaped && char === '\\') {
				escaped = true;
				continue;
			}
			if (!escaped && char === '`') mode = 'normal';
			escaped = false;
			continue;
		}
		if (char === '/' && next === '/') {
			mode = 'line-comment';
			index += 1;
			continue;
		}
		if (char === '/' && next === '*') {
			mode = 'block-comment';
			index += 1;
			continue;
		}
		if (char === "'") {
			mode = 'single-quote';
			continue;
		}
		if (char === '"') {
			mode = 'double-quote';
			continue;
		}
		if (char === '`') {
			mode = 'template';
			continue;
		}
		if (char === openChar) {
			depth += 1;
			continue;
		}
		if (char === closeChar) {
			depth -= 1;
			if (depth === 0) return index;
		}
	}
	throw new Error(
		`Could not find matching ${closeChar} for ${openChar} at ${openIndex}`,
	);
};

const findExportConstInitializerRange = (
	text: string,
	name: string,
	openChar: '{' | '[',
	closeChar: '}' | ']',
): { open: number; close: number } => {
	const declaration = new RegExp(
		`export const ${name}\\b[\\s\\S]*?=`,
		'u',
	).exec(text);
	if (declaration === null || declaration.index === undefined) {
		throw new Error(`Could not find export const ${name}`);
	}
	const open = text.indexOf(
		openChar,
		declaration.index + declaration[0].length,
	);
	if (open < 0) {
		throw new Error(`Could not find ${openChar} initializer for ${name}`);
	}
	const close = findMatchingDelimiter(text, open, openChar, closeChar);
	return { open, close };
};

const findContainerInsertPosition = (text: string, close: number): number =>
	text.lastIndexOf('\n', close - 1) + 1;

const findEntryIndent = (
	text: string,
	open: number,
	insertAt: number,
	fallback: string,
): string => {
	const body = text.slice(open + 1, insertAt).trimEnd();
	if (body.length === 0) return fallback;
	const lastLineStart = body.lastIndexOf('\n');
	const absoluteStart =
		lastLineStart >= 0 ? open + 1 + lastLineStart + 1 : open + 1;
	const indent = findLeadingIndent(text, absoluteStart);
	return indent.length > 0 ? indent : fallback;
};

const needsTrailingCommaBeforeInsert = (
	text: string,
	open: number,
	insertAt: number,
): boolean => {
	const content = text.slice(open + 1, insertAt).trimEnd();
	return content.length > 0 && !content.endsWith(',');
};

export const insertIntoObjectLiteral = (
	text: string,
	objectName: string,
	entryKey: string,
	entryText: string,
): { next: string; noop: boolean } => {
	const { open, close } = findExportConstInitializerRange(
		text,
		objectName,
		'{',
		'}',
	);
	const body = text.slice(open + 1, close);
	const alreadyPresent = new RegExp(
		`(?:'|")?${escapeRegex(entryKey)}(?:'|")?\\s*:`,
		'u',
	).test(body);
	if (alreadyPresent) return { next: text, noop: true };
	const insertAt = findContainerInsertPosition(text, close);
	const propertyIndent = findEntryIndent(text, open, insertAt, '\t');
	const insertion = `${needsTrailingCommaBeforeInsert(text, open, insertAt) ? ',' : ''}\n${propertyIndent}${entryText}`;
	return {
		next: `${text.slice(0, insertAt)}${insertion}${text.slice(insertAt)}`,
		noop: false,
	};
};

export const insertIntoArrayLiteral = (
	text: string,
	arrayName: string,
	entryValue: string,
	entryText: string,
): { next: string; noop: boolean } => {
	const { open, close } = findExportConstInitializerRange(
		text,
		arrayName,
		'[',
		']',
	);
	const body = text.slice(open + 1, close);
	if (body.includes(`'${entryValue}'`) || body.includes(`"${entryValue}"`)) {
		return { next: text, noop: true };
	}
	const insertAt = findContainerInsertPosition(text, close);
	const elementIndent = findEntryIndent(text, open, insertAt, '\t');
	const insertion = `${needsTrailingCommaBeforeInsert(text, open, insertAt) ? ',' : ''}\n${elementIndent}${entryText}`;
	return {
		next: `${text.slice(0, insertAt)}${insertion}${text.slice(insertAt)}`,
		noop: false,
	};
};

const findPresetMembersRange = (
	text: string,
	presetId: string,
): { open: number; close: number } => {
	const catalog = findExportConstInitializerRange(
		text,
		'PRESET_CATALOG',
		'[',
		']',
	);
	const catalogBody = text.slice(catalog.open + 1, catalog.close);
	const idNeedle = `id: '${presetId}'`;
	const idOffset = catalogBody.indexOf(idNeedle);
	if (idOffset < 0) {
		throw new Error(`Could not find preset ${presetId} in PRESET_CATALOG`);
	}
	const absoluteId = catalog.open + 1 + idOffset;
	const objectOpen = text.lastIndexOf('{', absoluteId);
	if (objectOpen < 0) {
		throw new Error(`Could not locate preset object for ${presetId}`);
	}
	const objectClose = findMatchingDelimiter(text, objectOpen, '{', '}');
	const objectBody = text.slice(objectOpen + 1, objectClose);
	const membersOffset = objectBody.indexOf('members');
	if (membersOffset < 0) {
		throw new Error(`Could not find members array for preset ${presetId}`);
	}
	const membersLabel = objectOpen + 1 + membersOffset;
	const open = text.indexOf('[', membersLabel);
	if (open < 0 || open > objectClose) {
		throw new Error(
			`Could not find members array opener for preset ${presetId}`,
		);
	}
	const close = findMatchingDelimiter(text, open, '[', ']');
	return { open, close };
};

export const insertIntoPresetMembers = (
	text: string,
	presetId: string,
	pluginId: string,
): { next: string; noop: boolean } => {
	const { open, close } = findPresetMembersRange(text, presetId);
	const body = text.slice(open + 1, close);
	const alreadyPresent = body.includes(`plugin: '${pluginId}'`);
	if (alreadyPresent) return { next: text, noop: true };
	const insertAt = findContainerInsertPosition(text, close);
	const elementIndent = findEntryIndent(text, open, insertAt, '\t\t\t');
	const insertion = `${needsTrailingCommaBeforeInsert(text, open, insertAt) ? ',' : ''}\n${elementIndent}{ plugin: '${pluginId}' },`;
	return {
		next: `${text.slice(0, insertAt)}${insertion}${text.slice(insertAt)}`,
		noop: false,
	};
};

export const injectAfterLastMatch = (
	text: string,
	anchor: RegExp,
	block: string,
): string => {
	const matches = [...text.matchAll(new RegExp(anchor.source, 'gu'))];
	const last = matches[matches.length - 1];
	if (last === undefined || last.index === undefined) {
		throw new Error(`Could not find structural anchor ${anchor.source}`);
	}
	const insertAt = last.index + last[0].length;
	return `${text.slice(0, insertAt)}\n${block}${text.slice(insertAt)}`;
};

export const injectBeforeLastClosing = (
	text: string,
	anchorText: string,
	block: string,
): string => {
	const anchorIdx = text.lastIndexOf(anchorText);
	if (anchorIdx < 0) {
		throw new Error(`Could not find structural anchor ${anchorText}`);
	}
	const insertAt = anchorIdx + anchorText.length;
	return `${text.slice(0, insertAt)}\n\t${block}${text.slice(insertAt)}`;
};
