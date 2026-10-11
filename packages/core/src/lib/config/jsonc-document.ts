/**
 * jsonc-document.ts — f00502 S1: the only supported way to read and
 * write `delendai.config.json`.
 *
 * The configuration file is JSONC by contract: it may always carry
 * comments, and DelendAI must never destroy them when it edits the
 * file itself (`init`, config sync, migrations, enabling or disabling
 * a plugin, changing preset). `JSON.parse` + `JSON.stringify` cannot
 * honour that — the comments, the key order and the user's manual
 * formatting all disappear on the round trip — so every read goes
 * through `parseJsonc` and every write through `applyJsoncEdits`.
 *
 * Both are pure: same input, same output, no I/O. Callers own the
 * file access.
 */
import {
	applyEdits,
	findNodeAtLocation,
	modify,
	parse as parseWithComments,
	parseTree,
	type FormattingOptions,
	type ParseError,
	printParseErrorCode,
} from 'jsonc-parser';

/** One syntax problem, positioned so a diagnostic can point at it. */
export interface IJsoncSyntaxError {
	/** 1-based line, so it can be shown to a human unchanged. */
	readonly line: number;
	/** 1-based column. */
	readonly column: number;
	readonly message: string;
}

export interface IJsoncParseResult {
	/**
	 * The parsed value, or `undefined` when the text could not yield
	 * one. Recoverable problems (a trailing comma, a stray token) still
	 * produce a value AND an entry in `errors`, so a caller may choose
	 * between being forgiving and being strict.
	 */
	readonly value: unknown;
	readonly errors: readonly IJsoncSyntaxError[];
}

/**
 * A single change to the document. `path` addresses a nested member the
 * way a JSON pointer would (`['plugins', 'browser', 'enabled']`), with
 * numbers indexing arrays.
 */
export interface IJsoncEdit {
	readonly path: readonly (string | number)[];
	/** `undefined` removes the member instead of writing it. */
	readonly value: unknown;
	/**
	 * Comment lines written immediately above the member, and ONLY when
	 * this edit creates it. An existing member keeps whatever comment
	 * the user has there — that is the whole point of the format.
	 */
	readonly leadingComment?: readonly string[];
}

const DEFAULT_INDENT = '\t';

/** Offsets are cheap to produce and useless to a human; turn them into positions. */
const toPosition = (
	text: string,
	offset: number,
): { line: number; column: number } => {
	const before = text.slice(0, Math.max(0, offset));
	const lines = before.split('\n');
	return {
		line: lines.length,
		column: (lines[lines.length - 1]?.length ?? 0) + 1,
	};
};

const toSyntaxError = (text: string, error: ParseError): IJsoncSyntaxError => {
	const { line, column } = toPosition(text, error.offset);
	return {
		line,
		column,
		message: printParseErrorCode(error.error),
	};
};

/**
 * The document's own indentation, so an edit blends in instead of
 * imposing a house style on a file the user formatted. Falls back to a
 * tab, which is what the scaffolder writes.
 */
export const detectIndent = (
	text: string,
): { readonly indent: string; readonly usesTabs: boolean } => {
	const match = /^([ \t]+)\S/mu.exec(text);
	const indent = match?.[1] ?? DEFAULT_INDENT;
	return { indent, usesTabs: indent.startsWith('\t') };
};

const detectEol = (text: string): '\r\n' | '\n' =>
	text.includes('\r\n') ? '\r\n' : '\n';

const toFormattingOptions = (text: string): FormattingOptions => {
	const { indent, usesTabs } = detectIndent(text);
	return {
		insertSpaces: !usesTabs,
		tabSize: usesTabs ? 1 : indent.length,
		eol: detectEol(text),
	};
};

/**
 * Parse JSONC — line comments, block comments and trailing commas all
 * allowed. Never throws: a malformed document yields `errors` so the
 * caller decides whether to refuse or to carry on with nothing.
 */
export const parseJsonc = (text: string): IJsoncParseResult => {
	const errors: ParseError[] = [];
	const value: unknown = parseWithComments(text, errors, {
		allowTrailingComma: true,
		disallowComments: false,
	});
	return {
		value,
		errors: errors.map((error) => toSyntaxError(text, error)),
	};
};

/** Whether the member this edit addresses already exists in the document. */
const memberExists = (
	text: string,
	path: readonly (string | number)[],
): boolean => {
	let cursor: unknown = parseJsonc(text).value;
	for (const segment of path) {
		if (cursor === null || typeof cursor !== 'object') return false;
		if (typeof segment === 'number') {
			if (!Array.isArray(cursor)) return false;
			cursor = cursor[segment];
			continue;
		}
		if (Array.isArray(cursor)) return false;
		const record = cursor as Record<string, unknown>;
		if (!Object.hasOwn(record, segment)) return false;
		cursor = record[segment];
	}
	return cursor !== undefined;
};

/**
 * The offset where `path`'s member starts, once it exists — the anchor
 * a leading comment is written above.
 *
 * Resolved through the parse tree rather than by searching the text for
 * the quoted key: the same key name legitimately appears under several
 * parents (every plugin has an `enabled`), so a textual search would
 * anchor the comment to whichever one happened to come last.
 */
const findMemberOffset = (
	text: string,
	path: readonly (string | number)[],
): number | undefined => {
	const root = parseTree(text, [], { allowTrailingComma: true });
	if (root === undefined) return undefined;
	const node = findNodeAtLocation(root, [...path]);
	if (node?.parent?.type !== 'property') return undefined;
	// The property node spans `"key": value`; its start is the key.
	return node.parent.offset;
};

/** The whitespace prefix of the line containing `offset`. */
const indentAt = (text: string, offset: number): string => {
	const lineStart = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
	const match = /^[ \t]*/u.exec(text.slice(lineStart, offset));
	return match?.[0] ?? '';
};

const insertLeadingComment = (
	text: string,
	path: readonly (string | number)[],
	lines: readonly string[],
	eol: string,
): string => {
	if (lines.length === 0) return text;
	const offset = findMemberOffset(text, path);
	if (offset === undefined) return text;
	const lineStart = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
	const indent = indentAt(text, offset);
	const block = lines.map((line) => `${indent}// ${line}`).join(eol) + eol;
	return text.slice(0, lineStart) + block + text.slice(lineStart);
};

/**
 * Apply edits in order, preserving every comment, unknown key, member
 * order and manual formatting the edits do not touch. Applying an empty
 * list returns the text byte-for-byte.
 */
export const applyJsoncEdits = (
	text: string,
	edits: readonly IJsoncEdit[],
): string => {
	const formattingOptions = toFormattingOptions(text);
	const eol = detectEol(text);
	let current = text;
	for (const edit of edits) {
		const isNewMember = !memberExists(current, edit.path);
		current = applyEdits(
			current,
			modify(current, [...edit.path], edit.value, {
				formattingOptions,
			}),
		);
		if (isNewMember && edit.leadingComment !== undefined) {
			current = insertLeadingComment(
				current,
				edit.path,
				edit.leadingComment,
				eol,
			);
		}
	}
	return current;
};
