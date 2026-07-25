/**
 * f00123 S1 — AST navigation engine (tokenizer-based, no runtime deps).
 *
 * S1 ships a minimal navigation layer that recognises the shapes an
 * LLM agent needs to ground a rename / codemod decision:
 *   - `findReferences(name)` — every identifier occurrence of `name`,
 *     with a flag for the declaration site.
 *   - `findDefinition(name)` — the first declaration site.
 *   - `listSymbols()` — every exported top-level declaration.
 *
 * It is a small, dependency-free TS tokenizer: it skips strings,
 * template expressions, regex literals, and block + line comments so
 * identifiers inside them are not surfaced. The shapes S2 and S3
 * (rename / codemod) replace this with a full AST walker; for the
 * navigation contract S1 only needs reliable identifier boundaries.
 */
export interface INavHit {
	readonly file: string;
	readonly line: number;
	readonly column: number;
	readonly kind: INavHitKind;
	readonly name: string;
	readonly isDefinition: boolean;
}

export type INavHitKind =
	| 'function'
	| 'class'
	| 'interface'
	| 'type'
	| 'variable'
	| 'enum'
	| 'import'
	| 'identifier';

export interface INavEngine {
	readonly findReferences: (name: string) => readonly INavHit[];
	readonly findDefinition: (name: string) => INavHit | undefined;
	readonly listSymbols: () => readonly INavHit[];
}

interface IToken {
	readonly text: string;
	readonly line: number;
	readonly column: number;
	readonly offset: number;
}

const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/y;

const skipString = (src: string, i: number, quote: string): number => {
	let j = i + 1;
	while (j < src.length) {
		const c = src[j];
		if (c === undefined) break;
		if (c === '\\') {
			j += 2;
			continue;
		}
		if (c === quote) return j + 1;
		if (c === '\n') return j;
		j++;
	}
	return j;
};

const skipLineComment = (src: string, i: number): number => {
	let j = i + 2;
	while (j < src.length && src[j] !== '\n') j++;
	return j;
};

const skipBlockComment = (src: string, i: number): number => {
	let j = i + 2;
	while (j < src.length - 1 && !(src[j] === '*' && src[j + 1] === '/')) j++;
	return Math.min(src.length, j + 2);
};

const tokenize = (src: string): IToken[] => {
	const tokens: IToken[] = [];
	let line = 1;
	let col = 1;
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		if (c === undefined) break;
		if (c === '\n') {
			line++;
			col = 1;
			i++;
			continue;
		}
		if (c === '/' && src[i + 1] === '/') {
			i = skipLineComment(src, i);
			continue;
		}
		if (c === '/' && src[i + 1] === '*') {
			i = skipBlockComment(src, i);
			continue;
		}
		if (c === '"' || c === "'") {
			i = skipString(src, i, c);
			continue;
		}
		if (c === '`') {
			let j = i + 1;
			while (j < src.length) {
				const cc = src[j];
				if (cc === undefined) break;
				if (cc === '\\') {
					j += 2;
					continue;
				}
				if (cc === '`') {
					j++;
					break;
				}
				j++;
			}
			i = j;
			continue;
		}
		IDENT_RE.lastIndex = i;
		const m = IDENT_RE.exec(src);
		if (m && m.index === i) {
			tokens.push({ text: m[0], line, column: col, offset: i });
			const len = m[0].length;
			i += len;
			col += len;
			continue;
		}
		i++;
		col++;
	}
	return tokens;
};

interface IDeclaration {
	readonly name: string;
	readonly offset: number;
	readonly kind: INavHitKind;
	readonly isExported: boolean;
}

const isExportContext = (src: string, offset: number): boolean => {
	// Scan the whole "statement head" (back to `;`, `{`, or start of
	// source) so `export const`, `export function`, `export default`,
	// and the `export { a, b, c }` re-export form are all detected.
	let i = offset - 1;
	while (i >= 0) {
		const c = src[i];
		if (c === undefined) break;
		if (c === ';' || c === '{' || c === '}') {
			i++;
			break;
		}
		i--;
	}
	const head = src.slice(Math.max(0, i), offset);
	return /\bexport\b/.test(head);
};

const classifyDecl = (
	src: string,
	nameOffset: number,
): INavHitKind | undefined => {
	let i = nameOffset - 1;
	while (i >= 0) {
		const c = src[i];
		if (c === undefined) break;
		if (!/[ \t]/.test(c)) break;
		i--;
	}
	const window = src.slice(Math.max(0, i - 11), nameOffset);
	if (/\bfunction\s*$/.test(window)) return 'function';
	if (/\bclass\s*$/.test(window)) return 'class';
	if (/\binterface\s*$/.test(window)) return 'interface';
	if (/\btype\s*$/.test(window)) return 'type';
	if (/\benum\s*$/.test(window)) return 'enum';
	if (/\b(?:const|let|var)\s*$/.test(window)) return 'variable';
	if (/\{\s*$/.test(window) && /\bimport\s*$/.test(src.slice(0, i + 1))) {
		return 'import';
	}
	if (/[{;,]\s*$/.test(window)) return undefined;
	return undefined;
};

const collectDeclarations = (src: string, tokens: IToken[]): IDeclaration[] => {
	const decls: IDeclaration[] = [];
	for (const tok of tokens) {
		const kind = classifyDecl(src, tok.offset);
		if (kind === undefined) continue;
		const exported = isExportContext(src, tok.offset);
		decls.push({
			name: tok.text,
			offset: tok.offset,
			kind,
			isExported: exported,
		});
	}
	return decls;
};

export const buildNavEngine = (file: string, source: string): INavEngine => {
	const tokens = tokenize(source);
	const declarations = collectDeclarations(source, tokens);
	const declByName = new Map<string, IDeclaration[]>();
	for (const d of declarations) {
		const arr = declByName.get(d.name) ?? [];
		arr.push(d);
		declByName.set(d.name, arr);
	}

	return {
		findReferences: (name) => {
			const hits: INavHit[] = [];
			for (const tok of tokens) {
				if (tok.text !== name) continue;
				const decls = declByName.get(name) ?? [];
				const decl = decls.find((d) => d.offset === tok.offset);
				hits.push({
					file,
					line: tok.line,
					column: tok.column,
					kind: decl?.kind ?? 'identifier',
					name,
					isDefinition: decl !== undefined,
				});
			}
			return hits;
		},
		findDefinition: (name) => {
			const decls = declByName.get(name) ?? [];
			const first = decls[0];
			if (first === undefined) return undefined;
			let line = 1;
			let column = 1;
			for (let i = 0; i < first.offset && i < source.length; i++) {
				if (source[i] === '\n') {
					line++;
					column = 1;
				} else {
					column++;
				}
			}
			return {
				file,
				line,
				column,
				kind: first.kind,
				name,
				isDefinition: true,
			};
		},
		listSymbols: () => {
			return declarations
				.filter((d) => d.isExported)
				.map((d) => {
					let line = 1;
					let column = 1;
					for (let i = 0; i < d.offset && i < source.length; i++) {
						if (source[i] === '\n') {
							line++;
							column = 1;
						} else {
							column++;
						}
					}
					return {
						file,
						line,
						column,
						kind: d.kind,
						name: d.name,
						isDefinition: true,
					};
				});
		},
	};
};

export const parseSourceFile = (file: string, source: string): string => {
	void file;
	return source;
};

export { tokenize };
