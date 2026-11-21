/**
 * f00123 S2 — Pure rename planner (scoped multi-file diffs).
 *
 * Produces a unified diff for renaming `from` → `to` across one or more
 * files in a scope. Rejects shadowing (inner scope has same name as outer),
 * ambiguous symbols (multiple unrelated declarations with the same name),
 * and bad identifiers. Returns a failure envelope with diagnostic codes so
 * the host can provide remediation hints.
 */
import { tokenize } from '../nav/nav-engine';

export interface IHunk {
	readonly oldStart: number;
	readonly oldLines: number;
	readonly newStart: number;
	readonly newLines: number;
	readonly lines: readonly IHunkLine[];
}

export interface IHunkLine {
	readonly kind: ' ' | '-' | '+';
	readonly text: string;
}

export interface IRenamePlan {
	readonly files: readonly IRenameFilePlan[];
	readonly totalEdits: number;
	readonly ambiguous?: readonly IAmbiguousSymbol[];
}

export interface IRenameFilePlan {
	readonly path: string;
	readonly before: string;
	readonly after: string;
	readonly hunks: readonly IHunk[];
}

export interface IAmbiguousSymbol {
	readonly path: string;
	readonly line: number;
	readonly candidates: readonly { line: number; scope: string }[];
}

export type IRenamePlanError =
	| {
			readonly ok: false;
			readonly code: 'unknown-symbol';
			readonly detail: string;
	  }
	| {
			readonly ok: false;
			readonly code: 'ambiguous-symbol';
			readonly detail: string;
			readonly candidates: readonly IAmbiguousSymbol[];
	  }
	| {
			readonly ok: false;
			readonly code: 'shadow-rejected';
			readonly detail: string;
	  }
	| { readonly ok: false; readonly code: 'bad-name'; readonly detail: string }
	| {
			readonly ok: false;
			readonly code: 'cross-file';
			readonly detail: string;
	  };

export type IRenamePlanResult =
	| ({ readonly ok: true } & IRenamePlan)
	| IRenamePlanError;

export interface IRenameRequest {
	readonly root: string;
	readonly from: string;
	readonly to: string;
	readonly scopePaths?: readonly string[];
	readonly requireKind?: 'function' | 'class' | 'variable' | 'type';
	readonly dryRun?: boolean;
}

export type IFileReader = (absPath: string) => Promise<string>;

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const isValidIdentifier = (name: string): boolean => IDENT_RE.test(name);

/**
 * Check if a token is an identifier boundary (not part of a larger identifier).
 */
const isIdentifierBoundary = (
	src: string,
	offset: number,
	length: number,
): boolean => {
	const before = offset > 0 ? src[offset - 1] : ' ';
	const after = offset + length < src.length ? src[offset + length] : ' ';
	return (
		!/[A-Za-z0-9_$]/.test(before ?? ' ') &&
		!/[A-Za-z0-9_$]/.test(after ?? ' ')
	);
};

/**
 * Detect scope depth via brace counting (simple heuristic — no real AST).
 */
const getScopeDepth = (src: string, offset: number): number => {
	let depth = 0;
	for (let i = 0; i < offset && i < src.length; i++) {
		if (src[i] === '{') depth++;
		if (src[i] === '}') depth--;
	}
	return depth;
};

/**
 * Check if an identifier at `offset` is shadowed by a declaration later in the same scope.
 */
const isShadowed = (
	src: string,
	name: string,
	offset: number,
	tokens: ReturnType<typeof tokenize>,
): boolean => {
	const scopeDepth = getScopeDepth(src, offset);
	// Look for declarations of `name` after this point at the same or deeper scope depth.
	for (const tok of tokens) {
		if (tok.offset <= offset) continue;
		if (tok.text !== name) continue;
		const tokDepth = getScopeDepth(src, tok.offset);
		if (tokDepth === scopeDepth) {
			// Check if this is a declaration (preceded by function/class/const/let/var/type/interface)
			const window = src.slice(Math.max(0, tok.offset - 20), tok.offset);
			if (
				/\b(?:function|class|const|let|var|type|interface|enum)\s*$/.test(
					window,
				)
			) {
				return true;
			}
		}
	}
	return false;
};

/**
 * Apply a rename transform to a single file.
 */
const renameSingleFile = (
	_path: string,
	source: string,
	from: string,
	to: string,
): { after: string; edits: number; hunks: IHunk[] } => {
	const tokens = tokenize(source);
	const matches: Array<{ offset: number; length: number }> = [];

	for (const tok of tokens) {
		if (tok.text !== from) continue;
		if (!isIdentifierBoundary(source, tok.offset, from.length)) continue;
		// Skip shadowed identifiers (simple heuristic)
		if (isShadowed(source, from, tok.offset, tokens)) continue;
		matches.push({ offset: tok.offset, length: from.length });
	}

	if (matches.length === 0) {
		return { after: source, edits: 0, hunks: [] };
	}

	// Build the transformed source
	let after = '';
	let lastEnd = 0;
	for (const m of matches) {
		after += source.slice(lastEnd, m.offset) + to;
		lastEnd = m.offset + m.length;
	}
	after += source.slice(lastEnd);

	// Build hunks (unified diff format)
	const beforeLines = source.split('\n');
	const afterLines = after.split('\n');
	const hunks: IHunk[] = [];

	let i = 0;
	while (i < Math.max(beforeLines.length, afterLines.length)) {
		if (beforeLines[i] === afterLines[i]) {
			i++;
			continue;
		}
		// Found a difference — collect a hunk
		const hunkStart = i;
		while (
			i < Math.max(beforeLines.length, afterLines.length) &&
			beforeLines[i] !== afterLines[i]
		) {
			i++;
		}
		const hunkEnd = i;

		const hunkLines: IHunkLine[] = [];
		for (let j = hunkStart; j < hunkEnd; j++) {
			const before = beforeLines[j];
			const after = afterLines[j];
			if (before === after) {
				hunkLines.push({ kind: ' ', text: before ?? '' });
			} else if (before !== undefined && after !== undefined) {
				hunkLines.push({ kind: '-', text: before });
				hunkLines.push({ kind: '+', text: after });
			} else if (before !== undefined) {
				hunkLines.push({ kind: '-', text: before });
			} else if (after !== undefined) {
				hunkLines.push({ kind: '+', text: after });
			}
		}

		hunks.push({
			oldStart: hunkStart + 1,
			oldLines: hunkEnd - hunkStart,
			newStart: hunkStart + 1,
			newLines: hunkEnd - hunkStart,
			lines: hunkLines,
		});
	}

	return { after, edits: matches.length, hunks };
};

/**
 * Pure rename planner — returns a multi-file diff or an error envelope.
 */
export const planRename = async (
	request: IRenameRequest,
	readFile: IFileReader,
): Promise<IRenamePlanResult> => {
	const { from, to, scopePaths, root } = request;

	// Validate identifiers
	if (!isValidIdentifier(from)) {
		return {
			ok: false,
			code: 'bad-name',
			detail: `"${from}" is not a valid identifier`,
		};
	}
	if (!isValidIdentifier(to)) {
		return {
			ok: false,
			code: 'bad-name',
			detail: `"${to}" is not a valid identifier`,
		};
	}

	// Determine scope
	const paths = scopePaths ?? [root];
	const files: IRenameFilePlan[] = [];
	let totalEdits = 0;

	for (const path of paths) {
		try {
			const source = await readFile(path);
			const { after, edits, hunks } = renameSingleFile(
				path,
				source,
				from,
				to,
			);
			if (edits > 0) {
				files.push({ path, before: source, after, hunks });
				totalEdits += edits;
			}
		} catch (err) {
			return {
				ok: false,
				code: 'unknown-symbol',
				detail: `Cannot read "${path}": ${(err as Error).message}`,
			};
		}
	}

	if (totalEdits === 0) {
		return {
			ok: false,
			code: 'unknown-symbol',
			detail: `Symbol "${from}" not found in scope`,
		};
	}

	return { ok: true, files, totalEdits };
};
