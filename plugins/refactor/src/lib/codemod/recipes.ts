import { extname } from 'node:path';

export interface ICodemodEdit {
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

export interface ICodemodRecipeResult {
	readonly edits: readonly ICodemodEdit[];
	readonly language: string;
}

export interface ICodemodRecipe {
	readonly id:
		| 'ts/no-throw-literal'
		| 'ts/strict-equal'
		| 'ts/console-to-logger';
	readonly title: string;
	readonly language: 'typescript';
	readonly extensions: readonly string[];
	readonly apply: (filePath: string, source: string) => ICodemodRecipeResult;
}

const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'] as const;

const LOGGER_METHODS = new Set(['log', 'info', 'warn', 'error', 'debug']);

const isIdentifierStart = (char: string | undefined): boolean => {
	return char !== undefined && /[A-Za-z_$]/.test(char);
};

const isIdentifierPart = (char: string | undefined): boolean => {
	return char !== undefined && /[A-Za-z0-9_$]/.test(char);
};

const isBoundary = (source: string, start: number, end: number): boolean => {
	return (
		!isIdentifierPart(source[start - 1]) && !isIdentifierPart(source[end])
	);
};

const skipQuoted = (source: string, start: number, quote: string): number => {
	let index = start + 1;
	while (index < source.length) {
		const char = source[index];
		if (char === '\\') {
			index += 2;
			continue;
		}
		if (char === quote) {
			return index + 1;
		}
		if (quote !== '`' && char === '\n') {
			return index;
		}
		index++;
	}
	return index;
};

const skipLineComment = (source: string, start: number): number => {
	let index = start + 2;
	while (index < source.length && source[index] !== '\n') {
		index++;
	}
	return index;
};

const skipBlockComment = (source: string, start: number): number => {
	let index = start + 2;
	while (
		index < source.length - 1 &&
		!(source[index] === '*' && source[index + 1] === '/')
	) {
		index++;
	}
	return Math.min(source.length, index + 2);
};

const previousSignificantChar = (
	source: string,
	start: number,
): string | undefined => {
	let index = start - 1;
	while (index >= 0) {
		const char = source[index];
		if (char !== undefined && !/\s/.test(char)) {
			return char;
		}
		index--;
	}
	return undefined;
};

const isRegexStart = (source: string, start: number): boolean => {
	if (source[start] !== '/') {
		return false;
	}
	const prev = previousSignificantChar(source, start);
	return prev === undefined || '([{:;,!?=+-*%^&|<>'.includes(prev);
};

const skipRegexLiteral = (source: string, start: number): number => {
	let index = start + 1;
	let inCharClass = false;
	while (index < source.length) {
		const char = source[index];
		if (char === '\\') {
			index += 2;
			continue;
		}
		if (char === '[') {
			inCharClass = true;
			index++;
			continue;
		}
		if (char === ']') {
			inCharClass = false;
			index++;
			continue;
		}
		if (char === '/' && !inCharClass) {
			index++;
			while (/[A-Za-z]/.test(source[index] ?? '')) {
				index++;
			}
			return index;
		}
		index++;
	}
	return index;
};

const skipWhitespace = (source: string, start: number): number => {
	let index = start;
	while (index < source.length && /\s/.test(source[index] ?? '')) {
		index++;
	}
	return index;
};

const readIdentifier = (
	source: string,
	start: number,
): { text: string; end: number } | undefined => {
	if (!isIdentifierStart(source[start])) {
		return undefined;
	}
	let index = start + 1;
	while (index < source.length && isIdentifierPart(source[index])) {
		index++;
	}
	return { text: source.slice(start, index), end: index };
};

const scanSource = (
	source: string,
	visitor: (index: number) => number | undefined,
): void => {
	let index = 0;
	while (index < source.length) {
		const char = source[index];
		if (char === undefined) {
			break;
		}
		if (char === '/' && source[index + 1] === '/') {
			index = skipLineComment(source, index);
			continue;
		}
		if (char === '/' && source[index + 1] === '*') {
			index = skipBlockComment(source, index);
			continue;
		}
		if (char === "'" || char === '"' || char === '`') {
			index = skipQuoted(source, index, char);
			continue;
		}
		if (char === '/' && isRegexStart(source, index)) {
			index = skipRegexLiteral(source, index);
			continue;
		}

		const next = visitor(index);
		if (next !== undefined && next > index) {
			index = next;
			continue;
		}
		index++;
	}
};

const readThrowLiteralEnd = (source: string, start: number): number => {
	let index = start;
	let braceDepth = 0;
	let bracketDepth = 0;
	let parenDepth = 0;
	while (index < source.length) {
		const char = source[index];
		if (char === undefined) {
			break;
		}
		if (char === '/' && source[index + 1] === '/') {
			return index;
		}
		if (char === '/' && source[index + 1] === '*') {
			index = skipBlockComment(source, index);
			continue;
		}
		if (char === "'" || char === '"' || char === '`') {
			index = skipQuoted(source, index, char);
			continue;
		}
		if (char === '(') parenDepth++;
		if (char === ')') {
			if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
				return index;
			}
			parenDepth = Math.max(0, parenDepth - 1);
		}
		if (char === '{') braceDepth++;
		if (char === '}') {
			if (braceDepth === 0 && bracketDepth === 0 && parenDepth === 0) {
				return index;
			}
			braceDepth = Math.max(0, braceDepth - 1);
		}
		if (char === '[') bracketDepth++;
		if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
		if (
			(char === ';' || char === '\n') &&
			braceDepth === 0 &&
			bracketDepth === 0 &&
			parenDepth === 0
		) {
			return index;
		}
		index++;
	}
	return index;
};

const sortEdits = (edits: readonly ICodemodEdit[]): readonly ICodemodEdit[] => {
	return [...edits].sort((left, right) => right.start - left.start);
};

const collectNoThrowLiteralEdits = (
	source: string,
): readonly ICodemodEdit[] => {
	const edits: ICodemodEdit[] = [];
	scanSource(source, (index) => {
		if (!source.startsWith('throw', index)) {
			return undefined;
		}
		const keywordEnd = index + 'throw'.length;
		if (!isBoundary(source, index, keywordEnd)) {
			return undefined;
		}
		const exprStart = skipWhitespace(source, keywordEnd);
		const literalChar = source[exprStart];
		const identifier = readIdentifier(source, exprStart);
		const startsLiteral =
			literalChar === "'" ||
			literalChar === '"' ||
			literalChar === '`' ||
			literalChar === '[' ||
			literalChar === '{' ||
			literalChar === '-' ||
			/[0-9]/.test(literalChar ?? '') ||
			identifier?.text === 'true' ||
			identifier?.text === 'false' ||
			identifier?.text === 'null';
		if (!startsLiteral) {
			return keywordEnd;
		}
		const exprEnd = readThrowLiteralEnd(source, exprStart);
		const expression = source.slice(exprStart, exprEnd).trimEnd();
		edits.push({
			start: exprStart,
			end: exprEnd,
			text: `new Error(${expression})`,
		});
		return exprEnd;
	});
	return sortEdits(edits);
};

const collectStrictEqualEdits = (source: string): readonly ICodemodEdit[] => {
	const edits: ICodemodEdit[] = [];
	scanSource(source, (index) => {
		if (
			source.startsWith('===', index) ||
			source.startsWith('!==', index)
		) {
			return index + 3;
		}
		if (source.startsWith('==', index)) {
			edits.push({ start: index, end: index + 2, text: '===' });
			return index + 2;
		}
		if (source.startsWith('!=', index)) {
			edits.push({ start: index, end: index + 2, text: '!==' });
			return index + 2;
		}
		return undefined;
	});
	return sortEdits(edits);
};

const collectConsoleToLoggerEdits = (
	source: string,
): readonly ICodemodEdit[] => {
	const edits: ICodemodEdit[] = [];
	scanSource(source, (index) => {
		if (!source.startsWith('console', index)) {
			return undefined;
		}
		const consoleEnd = index + 'console'.length;
		if (!isBoundary(source, index, consoleEnd)) {
			return undefined;
		}
		const prev = previousSignificantChar(source, index);
		if (prev === '.' || prev === '?') {
			return consoleEnd;
		}
		let cursor = skipWhitespace(source, consoleEnd);
		if (source[cursor] !== '.') {
			return consoleEnd;
		}
		cursor = skipWhitespace(source, cursor + 1);
		const method = readIdentifier(source, cursor);
		if (method === undefined || !LOGGER_METHODS.has(method.text)) {
			return consoleEnd;
		}
		const callStart = skipWhitespace(source, method.end);
		if (source[callStart] !== '(') {
			return method.end;
		}
		edits.push({
			start: index,
			end: method.end,
			text: `logger.${method.text}`,
		});
		return method.end;
	});
	return sortEdits(edits);
};

const noThrowLiteralRecipe: ICodemodRecipe = {
	id: 'ts/no-throw-literal',
	title: 'Wrap throw literals in Error',
	language: 'typescript',
	extensions: TS_EXTENSIONS,
	apply(_filePath, source) {
		return {
			edits: collectNoThrowLiteralEdits(source),
			language: 'typescript',
		};
	},
};

const strictEqualRecipe: ICodemodRecipe = {
	id: 'ts/strict-equal',
	title: 'Replace loose equality with strict equality',
	language: 'typescript',
	extensions: TS_EXTENSIONS,
	apply(_filePath, source) {
		return {
			edits: collectStrictEqualEdits(source),
			language: 'typescript',
		};
	},
};

const consoleToLoggerRecipe: ICodemodRecipe = {
	id: 'ts/console-to-logger',
	title: 'Redirect console calls to logger',
	language: 'typescript',
	extensions: TS_EXTENSIONS,
	apply(_filePath, source) {
		return {
			edits: collectConsoleToLoggerEdits(source),
			language: 'typescript',
		};
	},
};

export const CODEMOD_RECIPES = [
	noThrowLiteralRecipe,
	strictEqualRecipe,
	consoleToLoggerRecipe,
] as const satisfies readonly ICodemodRecipe[];

export const CODEMOD_RECIPE_IDS = CODEMOD_RECIPES.map(
	(recipe) => recipe.id,
) as [ICodemodRecipe['id'], ...ICodemodRecipe['id'][]];

export const getCodemodRecipe = (
	recipeId: ICodemodRecipe['id'],
): ICodemodRecipe | undefined => {
	return CODEMOD_RECIPES.find((recipe) => recipe.id === recipeId);
};

export const isSupportedCodemodPath = (
	recipe: ICodemodRecipe,
	filePath: string,
): boolean => {
	return recipe.extensions.includes(extname(filePath));
};

export const applyCodemodEdits = (
	source: string,
	edits: readonly ICodemodEdit[],
): string => {
	let nextSource = source;
	for (const edit of edits) {
		nextSource =
			nextSource.slice(0, edit.start) +
			edit.text +
			nextSource.slice(edit.end);
	}
	return nextSource;
};
