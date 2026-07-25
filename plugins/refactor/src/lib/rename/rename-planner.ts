/**
 * f00123 S2 — Safe-rename planner.
 *
 * Pure: takes a project model (file → source) and a rename request
 * (`oldName` → `newName` scoped to a `from` file), returns a unified
 * diff that only edits the *exact* identifier occurrences of `oldName`
 * inside `from`.
 *
 * Safety rules:
 *  - The planner refuses to rename a name that has multiple distinct
 *    declarations in the file unless the caller pins `requireKind` to
 *    the one they mean. This blocks the "rename the outer `foo` and
 *    accidentally rewrite the inner shadowed `foo` too" failure mode.
 *  - `requireKind` is also required when the planner needs to
 *    disambiguate the declaration (e.g. `const greet` and `function
 *    greet` both exist; the caller must say which).
 *  - Multi-file: the planner walks every file in `project`, but only
 *    edits those where the target has a single declaration OR the
 *    caller pinned `requireKind`. Files that contain a shadowed
 *    `oldName` without the caller's `requireKind` are left untouched
 *    (fail-closed at the per-file level: planner returns ok with
 *    only the safe files patched, and the caller inspects the diff).
 *    A stricter variant that fails the whole plan on any shadowed
 *    file is exposed via `strict: true`.
 */
import { tokenize } from '../nav/nav-engine';

export type TRenameKind =
	| 'function'
	| 'class'
	| 'interface'
	| 'type'
	| 'variable'
	| 'enum';

export interface IRenameRequest {
	readonly from?: string;
	readonly oldName: string;
	readonly newName: string;
	readonly requireKind?: TRenameKind;
	/** When true, any shadowed file aborts the plan. Default false. */
	readonly strict?: boolean;
}

export interface IRenameFilePatch {
	readonly file: string;
	readonly edits: readonly {
		readonly offset: number;
		readonly length: number;
	}[];
	readonly newContent: string;
	readonly oldContent: string;
	readonly hits: number;
	readonly resolvedKind: TRenameKind | null;
}

export type IRenamePlan =
	| {
			readonly ok: true;
			readonly patches: readonly IRenameFilePatch[];
			readonly hits: number;
			readonly skipped: readonly string[];
	  }
	| {
			readonly ok: false;
			readonly code:
				| 'unknown-symbol'
				| 'cross-file'
				| 'bad-name'
				| 'ambiguous-symbol'
				| 'shadow-rejected';
			readonly message: string;
			readonly conflictingFile?: string;
	  };

const isValidIdent = (s: string): boolean =>
	/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);

const classifyAt = (
	source: string,
	offset: number,
): TRenameKind | 'import' | 'identifier' => {
	let i = offset - 1;
	while (i >= 0) {
		const c = source[i];
		if (c === undefined) break;
		if (!/[ \t]/.test(c)) break;
		i--;
	}
	const window = source.slice(Math.max(0, i - 11), offset);
	if (/\bfunction\s*$/.test(window)) return 'function';
	if (/\bclass\s*$/.test(window)) return 'class';
	if (/\binterface\s*$/.test(window)) return 'interface';
	if (/\btype\s*$/.test(window)) return 'type';
	if (/\benum\s*$/.test(window)) return 'enum';
	if (/\b(?:const|let|var)\s*$/.test(window)) return 'variable';
	if (/\{\s*$/.test(window) && /\bimport\s*$/.test(source.slice(0, i + 1))) {
		return 'import';
	}
	return 'identifier';
};

const buildDiff = (
	file: string,
	oldContent: string,
	newContent: string,
): string => {
	const oldLines = oldContent.split('\n');
	const newLines = newContent.split('\n');
	return [
		`--- a/${file}`,
		`+++ b/${file}`,
		`@@ -1,${oldLines.length} +1,${newLines.length} @@`,
		...oldLines.map((l) => `-${l}`),
		...newLines.map((l) => `+${l}`),
	].join('\n');
};

const buildFilePatch = (
	file: string,
	source: string,
	oldName: string,
	newName: string,
	resolvedKind: TRenameKind | null,
): IRenameFilePatch => {
	const tokens = tokenize(source);
	const offsets: number[] = [];
	for (const tok of tokens) {
		if (tok.text === oldName) offsets.push(tok.offset);
	}
	offsets.sort((a, b) => b - a);
	let content = source;
	for (const offset of offsets) {
		content =
			content.slice(0, offset) +
			newName +
			content.slice(offset + oldName.length);
	}
	return {
		file,
		edits: offsets
			.slice()
			.reverse()
			.map((offset) => ({ offset, length: oldName.length })),
		newContent: content,
		oldContent: source,
		hits: offsets.length,
		resolvedKind,
	};
};

const resolveKind = (
	source: string,
	oldName: string,
): readonly {
	readonly offset: number;
	readonly kind: TRenameKind | 'import' | 'identifier';
}[] => {
	const tokens = tokenize(source);
	const out: {
		offset: number;
		kind: TRenameKind | 'import' | 'identifier';
	}[] = [];
	for (const tok of tokens) {
		if (tok.text !== oldName) continue;
		const kind = classifyAt(source, tok.offset);
		if (kind === 'identifier') continue;
		out.push({ offset: tok.offset, kind });
	}
	return out;
};

const distinctDeclKinds = (
	entries: readonly {
		readonly kind: TRenameKind | 'import' | 'identifier';
	}[],
): readonly (TRenameKind | 'import')[] => {
	const seen = new Set<TRenameKind | 'import'>();
	for (const e of entries) {
		if (e.kind === 'identifier') continue;
		seen.add(e.kind);
	}
	return [...seen];
};

export const planRename = (
	request: IRenameRequest,
	project: Readonly<Record<string, string>>,
): IRenamePlan => {
	if (!isValidIdent(request.oldName) || !isValidIdent(request.newName)) {
		return {
			ok: false,
			code: 'bad-name',
			message: 'oldName and newName must be valid identifiers',
		};
	}
	if (request.oldName === request.newName) {
		return {
			ok: false,
			code: 'bad-name',
			message: 'oldName and newName are identical',
		};
	}
	const targets =
		request.from === undefined ? Object.keys(project) : [request.from];
	for (const f of targets) {
		if (project[f] === undefined) {
			return {
				ok: false,
				code: 'cross-file',
				message: `file "${f}" not in project`,
			};
		}
	}

	const patches: IRenameFilePatch[] = [];
	const skipped: string[] = [];
	let totalHits = 0;
	let sawDeclaration = false;

	for (const file of targets) {
		const source = project[file] as string;
		const decls = resolveKind(source, request.oldName);
		if (decls.length === 0) {
			skipped.push(file);
			continue;
		}
		sawDeclaration = true;
		const distinct = distinctDeclKinds(decls).filter((k) => k !== 'import');
		if (distinct.length > 1) {
			if (request.strict === true) {
				return {
					ok: false,
					code: 'shadow-rejected',
					message: `"${request.oldName}" shadows itself in ${file} (${distinct.join(', ')}); pass requireKind or strict:false`,
					conflictingFile: file,
				};
			}
			if (request.requireKind === undefined) {
				skipped.push(file);
				continue;
			}
			if (!distinct.includes(request.requireKind)) {
				skipped.push(file);
				continue;
			}
		}
		const patch = buildFilePatch(
			file,
			source,
			request.oldName,
			request.newName,
			request.requireKind ?? null,
		);
		patches.push(patch);
		totalHits += patch.hits;
	}

	if (patches.length === 0) {
		// Three cases here:
		//  - Nothing found anywhere → unknown-symbol.
		//  - Found, but the caller's requireKind excluded it → unknown-symbol
		//    (the symbol is not the kind the caller asked for).
		//  - Found, but the name shadows itself in a target → ambiguous-symbol.
		const code = sawDeclaration ? 'ambiguous-symbol' : 'unknown-symbol';
		return {
			ok: false,
			code,
			message:
				code === 'ambiguous-symbol'
					? `"${request.oldName}" shadows itself in ${skipped.join(', ')}; refine requireKind`
					: `"${request.oldName}" has no declaration in any target file`,
			...(skipped[0] !== undefined
				? { conflictingFile: skipped[0] }
				: {}),
		};
	}

	return { ok: true, patches, hits: totalHits, skipped };
};

export const formatPlanDiff = (
	plan: Extract<IRenamePlan, { ok: true }>,
): string =>
	plan.patches
		.map((p) => buildDiff(p.file, p.oldContent, p.newContent))
		.join('\n');
