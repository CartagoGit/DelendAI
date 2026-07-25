import type { ICodemodRecipe } from './recipes';

export interface ICodemodTextEdit {
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

export interface ICodemodFileResult {
	readonly path: string;
	readonly diff: string;
	readonly newContent: string;
	readonly oldContent: string;
	readonly edits: number;
}

const applyEdits = (
	source: string,
	edits: readonly ICodemodTextEdit[],
): string => {
	const sorted = [...edits].sort((left, right) => right.start - left.start);
	let next = source;
	for (const edit of sorted) {
		next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
	}
	return next;
};

const buildDiff = (
	path: string,
	oldContent: string,
	newContent: string,
): string => {
	const oldLines = oldContent.split('\n');
	const newLines = newContent.split('\n');
	const removed = oldLines.map((line) => ` ${line}`).join('\n');
	const added = newLines.map((line) => `+${line}`).join('\n');
	return [
		`--- a/${path}`,
		`+++ b/${path}`,
		`@@ -1,${oldLines.length} +1,${newLines.length} @@`,
		`-${removed.replace(/^\+/gm, ' ')}`,
		`+${added.replace(/^\+/gm, '+')}`,
	].join('\n');
};

const isIdentifierPart = (char: string | undefined): boolean =>
	char !== undefined && /[A-Za-z0-9_$]/.test(char);

const skipLineComment = (source: string, start: number): number => {
	let cursor = start + 2;
	while (cursor < source.length && source[cursor] !== '\n') cursor++;
	return cursor;
};

const skipBlockComment = (source: string, start: number): number => {
	let cursor = start + 2;
	while (cursor < source.length - 1) {
		if (source[cursor] === '*' && source[cursor + 1] === '/')
			return cursor + 2;
		cursor++;
	}
	return source.length;
};

const skipQuoted = (source: string, start: number, quote: string): number => {
	let cursor = start + 1;
	while (cursor < source.length) {
		const char = source[cursor];
		if (char === undefined) break;
		if (char === '\\') {
			cursor += 2;
			continue;
		}
		if (char === quote) return cursor + 1;
		cursor++;
	}
	return cursor;
};

const skipTrivia = (source: string, start: number): number => {
	const char = source[start];
	const next = source[start + 1];
	if (char === '/' && next === '/') return skipLineComment(source, start);
	if (char === '/' && next === '*') return skipBlockComment(source, start);
	if (char === "'" || char === '"' || char === '`')
		return skipQuoted(source, start, char);
	return start;
};

const skipWhitespace = (source: string, start: number): number => {
	let cursor = start;
	while (cursor < source.length && /\s/.test(source[cursor] ?? '')) cursor++;
	return cursor;
};

const findStringLiteralEnd = (
	source: string,
	start: number,
): number | undefined => {
	const quote = source[start];
	if (quote !== "'" && quote !== '"' && quote !== '`') return undefined;
	const end = skipQuoted(source, start, quote);
	if (end <= start) return undefined;
	return end;
};

const walkCode = (
	source: string,
	onCode: (offset: number) => number | undefined,
): void => {
	let cursor = 0;
	while (cursor < source.length) {
		const skipped = skipTrivia(source, cursor);
		if (skipped !== cursor) {
			cursor = skipped;
			continue;
		}
		const next = onCode(cursor);
		if (next !== undefined && next > cursor) {
			cursor = next;
			continue;
		}
		cursor++;
	}
};

const hasObviousLoggerImport = (source: string): boolean =>
	/^\s*import\s+logger\s+from\s+['"][^'"]+['"];?/m.test(source) ||
	/^\s*import\s+\*\s+as\s+logger\s+from\s+['"][^'"]+['"];?/m.test(source) ||
	/^\s*import\s+\{[^}\n]*\blogger\b[^}\n]*\}\s+from\s+['"][^'"]+['"];?/m.test(
		source,
	);

const collectThrowLiteralEdits = (source: string): ICodemodTextEdit[] => {
	const edits: ICodemodTextEdit[] = [];
	walkCode(source, (offset) => {
		if (!source.startsWith('throw', offset)) return undefined;
		if (
			isIdentifierPart(source[offset - 1]) ||
			isIdentifierPart(source[offset + 5])
		) {
			return undefined;
		}
		const valueStart = skipWhitespace(source, offset + 5);
		const valueEnd = findStringLiteralEnd(source, valueStart);
		if (valueEnd === undefined) return undefined;
		edits.push({
			start: valueStart,
			end: valueEnd,
			text: `new Error(${source.slice(valueStart, valueEnd)})`,
		});
		return valueEnd;
	});
	return edits;
};

const collectStrictEqualEdits = (source: string): ICodemodTextEdit[] => {
	const edits: ICodemodTextEdit[] = [];
	walkCode(source, (offset) => {
		if (source[offset] !== '=' || source[offset + 1] !== '=')
			return undefined;
		if (source[offset + 2] === '=') return undefined;
		const prev = source[offset - 1];
		if (prev === '!' || prev === '=' || prev === '<' || prev === '>')
			return undefined;
		edits.push({ start: offset, end: offset + 2, text: '===' });
		return offset + 2;
	});
	return edits;
};

const collectConsoleToLoggerEdits = (source: string): ICodemodTextEdit[] => {
	if (!hasObviousLoggerImport(source)) return [];
	const edits: ICodemodTextEdit[] = [];
	walkCode(source, (offset) => {
		if (!source.startsWith('console.log', offset)) return undefined;
		if (isIdentifierPart(source[offset - 1])) return undefined;
		if (source[offset + 'console.log'.length] !== '(') return undefined;
		edits.push({
			start: offset,
			end: offset + 'console.log'.length,
			text: 'logger.info',
		});
		return offset + 'console.log'.length;
	});
	return edits;
};

const collectEdits = (
	recipe: ICodemodRecipe,
	source: string,
): ICodemodTextEdit[] => {
	switch (recipe.id) {
		case 'ts/no-throw-literal':
			return collectThrowLiteralEdits(source);
		case 'ts/strict-equal':
			return collectStrictEqualEdits(source);
		case 'ts/console-to-logger':
			return collectConsoleToLoggerEdits(source);
		default:
			return [];
	}
};

export const runCodemodRecipeOnSource = (
	recipe: ICodemodRecipe,
	path: string,
	source: string,
): ICodemodFileResult | undefined => {
	const edits = collectEdits(recipe, source);
	if (edits.length === 0) return undefined;
	const newContent = applyEdits(source, edits);
	if (newContent === source) return undefined;
	return {
		path,
		diff: buildDiff(path, source, newContent),
		newContent,
		oldContent: source,
		edits: edits.length,
	};
};
