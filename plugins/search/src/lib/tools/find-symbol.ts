export type SearchSymbolKind =
	| 'function'
	| 'class'
	| 'interface'
	| 'type'
	| 'enum'
	| 'variable'
	| 'export-from';

export interface ISearchSymbolHit {
	readonly file: string;
	readonly line: number;
	readonly column: number;
	readonly kind: SearchSymbolKind;
	readonly exportPath?: string;
}

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const preserveLayout = (source: string): string => {
	let out = '';
	let i = 0;
	while (i < source.length) {
		const ch = source[i] ?? '';
		const next = source[i + 1] ?? '';
		if (ch === '/' && next === '/') {
			out += '  ';
			i += 2;
			while (i < source.length && source[i] !== '\n') {
				out += ' ';
				i += 1;
			}
			continue;
		}
		if (ch === '/' && next === '*') {
			out += '  ';
			i += 2;
			while (i < source.length) {
				const c = source[i] ?? '';
				const n = source[i + 1] ?? '';
				if (c === '*' && n === '/') {
					out += '  ';
					i += 2;
					break;
				}
				out += c === '\n' ? '\n' : ' ';
				i += 1;
			}
			continue;
		}
		if (ch === '"' || ch === "'" || ch === '`') {
			const quote = ch;
			out += ' ';
			i += 1;
			while (i < source.length) {
				const c = source[i] ?? '';
				if (c === '\\') {
					out += '  ';
					i += 2;
					continue;
				}
				if (c === quote) {
					out += ' ';
					i += 1;
					break;
				}
				out += c === '\n' ? '\n' : ' ';
				i += 1;
			}
			continue;
		}
		out += ch;
		i += 1;
	}
	return out;
};

const lineColAt = (
	source: string,
	offset: number,
): { line: number; column: number } => {
	const before = source.slice(0, offset);
	const lines = before.split('\n');
	return {
		line: lines.length,
		column: (lines[lines.length - 1] ?? '').length + 1,
	};
};

const pushHits = (
	hits: ISearchSymbolHit[],
	file: string,
	source: string,
	kind: SearchSymbolKind,
	regex: RegExp,
	mapOffset?: (match: RegExpExecArray) => number,
	mapExportPath?: (match: RegExpExecArray) => string | undefined,
): void => {
	while (true) {
		const match = regex.exec(source);
		if (match === null) break;
		const offset = mapOffset ? mapOffset(match) : match.index;
		const { line, column } = lineColAt(source, offset);
		const exportPath = mapExportPath?.(match);
		hits.push({
			file,
			line,
			column,
			kind,
			...(exportPath !== undefined ? { exportPath } : {}),
		});
	}
};

export const findSymbolDeclarations = (
	file: string,
	source: string,
	symbol: string,
): readonly ISearchSymbolHit[] => {
	const masked = preserveLayout(source);
	const escaped = escapeRegExp(symbol);
	const hits: ISearchSymbolHit[] = [];
	pushHits(
		hits,
		file,
		masked,
		'function',
		new RegExp(
			`\\bexport\\s+(?:default\\s+)?(?:async\\s+)?function\\s+(${escaped})\\b`,
			'g',
		),
		(match) => (match.index ?? 0) + match[0].lastIndexOf(symbol),
		undefined,
	);
	pushHits(
		hits,
		file,
		masked,
		'class',
		new RegExp(
			`\\bexport\\s+(?:default\\s+)?class\\s+(${escaped})\\b`,
			'g',
		),
		(match) => (match.index ?? 0) + match[0].lastIndexOf(symbol),
		undefined,
	);
	pushHits(
		hits,
		file,
		masked,
		'interface',
		new RegExp(`\\bexport\\s+interface\\s+(${escaped})\\b`, 'g'),
		(match) => (match.index ?? 0) + match[0].lastIndexOf(symbol),
		undefined,
	);
	pushHits(
		hits,
		file,
		masked,
		'type',
		new RegExp(`\\bexport\\s+type\\s+(${escaped})\\b`, 'g'),
		(match) => (match.index ?? 0) + match[0].lastIndexOf(symbol),
		undefined,
	);
	pushHits(
		hits,
		file,
		masked,
		'enum',
		new RegExp(`\\bexport\\s+enum\\s+(${escaped})\\b`, 'g'),
		(match) => (match.index ?? 0) + match[0].lastIndexOf(symbol),
		undefined,
	);
	pushHits(
		hits,
		file,
		masked,
		'variable',
		new RegExp(`\\bexport\\s+(?:const|let|var)\\s+(${escaped})\\b`, 'g'),
		(match) => (match.index ?? 0) + match[0].lastIndexOf(symbol),
		undefined,
	);

	const exportFrom = /\bexport\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
	while (true) {
		const match = exportFrom.exec(source);
		if (match === null) break;
		const members = (match[1] ?? '')
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean);
		for (const member of members) {
			const [local, alias] = member
				.split(/\s+as\s+/i)
				.map((part) => part.trim());
			const exportedName = alias ?? local;
			if (exportedName !== symbol) continue;
			const memberOffset =
				(match.index ?? 0) +
				match[0].indexOf(member) +
				member.lastIndexOf(exportedName);
			const { line, column } = lineColAt(source, memberOffset);
			hits.push({
				file,
				line,
				column,
				kind: 'export-from',
				...(match[2] !== undefined ? { exportPath: match[2] } : {}),
			});
		}
	}

	return hits.sort(
		(a, b) =>
			a.file.localeCompare(b.file) ||
			a.line - b.line ||
			a.column - b.column,
	);
};

interface IToken {
	readonly text: string;
	readonly line: number;
	readonly column: number;
	readonly offset: number;
}

const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/y;

const tokenize = (source: string): IToken[] => {
	const tokens: IToken[] = [];
	let line = 1;
	let column = 1;
	let i = 0;
	while (i < source.length) {
		const ch = source[i];
		const next = source[i + 1];
		if (ch === undefined) break;
		if (ch === '\n') {
			line += 1;
			column = 1;
			i += 1;
			continue;
		}
		if (ch === '/' && next === '/') {
			while (i < source.length && source[i] !== '\n') i += 1;
			continue;
		}
		if (ch === '/' && next === '*') {
			i += 2;
			while (
				i < source.length &&
				!(source[i] === '*' && source[i + 1] === '/')
			) {
				if (source[i] === '\n') {
					line += 1;
					column = 1;
				} else {
					column += 1;
				}
				i += 1;
			}
			i += 2;
			column += 2;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === '`') {
			const quote = ch;
			i += 1;
			column += 1;
			while (i < source.length) {
				const current = source[i];
				if (current === '\\') {
					i += 2;
					column += 2;
					continue;
				}
				if (current === quote) {
					i += 1;
					column += 1;
					break;
				}
				if (current === '\n') {
					line += 1;
					column = 1;
					i += 1;
					continue;
				}
				i += 1;
				column += 1;
			}
			continue;
		}
		IDENT_RE.lastIndex = i;
		const match = IDENT_RE.exec(source);
		if (match && match.index === i) {
			tokens.push({ text: match[0], line, column, offset: i });
			i += match[0].length;
			column += match[0].length;
			continue;
		}
		i += 1;
		column += 1;
	}
	return tokens;
};

const classifyDefinitionOffsets = (
	source: string,
	symbol: string,
): Set<number> => {
	const masked = preserveLayout(source);
	const escaped = escapeRegExp(symbol);
	const patterns = [
		new RegExp(
			`\\b(?:export\\s+)?(?:async\\s+)?function\\s+(${escaped})\\b`,
			'g',
		),
		new RegExp(`\\b(?:export\\s+)?class\\s+(${escaped})\\b`, 'g'),
		new RegExp(`\\b(?:export\\s+)?interface\\s+(${escaped})\\b`, 'g'),
		new RegExp(`\\b(?:export\\s+)?type\\s+(${escaped})\\b`, 'g'),
		new RegExp(`\\b(?:export\\s+)?enum\\s+(${escaped})\\b`, 'g'),
		new RegExp(
			`\\b(?:export\\s+)?(?:const|let|var)\\s+(${escaped})\\b`,
			'g',
		),
	];
	const offsets = new Set<number>();
	for (const pattern of patterns) {
		while (true) {
			const match = pattern.exec(masked);
			if (match === null) break;
			offsets.add((match.index ?? 0) + match[0].lastIndexOf(symbol));
		}
	}
	return offsets;
};

export interface ISearchReferenceHit {
	readonly file: string;
	readonly line: number;
	readonly column: number;
	readonly isDefinition: boolean;
}

export const findSymbolReferences = (
	file: string,
	source: string,
	symbol: string,
): readonly ISearchReferenceHit[] => {
	const definitionOffsets = classifyDefinitionOffsets(source, symbol);
	return tokenize(source)
		.filter((token) => token.text === symbol)
		.map((token) => ({
			file,
			line: token.line,
			column: token.column,
			isDefinition: definitionOffsets.has(token.offset),
		}))
		.sort(
			(a, b) =>
				a.file.localeCompare(b.file) ||
				a.line - b.line ||
				a.column - b.column,
		);
};
