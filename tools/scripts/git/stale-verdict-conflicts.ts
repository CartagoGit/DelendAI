/**
 * stale-verdict-conflicts.ts — a pack of verdicts that conflicts with the
 * integration branch keeps its verdicts, unless they no longer apply.
 *
 * A review pack's commits change only verdict lines (a slice's status and
 * `review-*` lines, the document's transition and folder) and claims. When
 * the integration branch changed the same document after the pack left,
 * the two stopped merging and the pack sat DIRTY: its author was a session
 * that had ended, so nobody resolved it and its verdicts never landed
 * (#1800, #1808: each conflicted only where another round of the same
 * reviewer had landed its own verdict lines).
 *
 * The resolution is mechanical. A verdict is about one revision of a
 * slice: its files, gate, acceptance and the commit it shipped in. While
 * that revision is what the integration branch still has, the pack's
 * verdict lines are kept over the integration branch's, byte for byte,
 * and the integration branch's text is taken everywhere else. When the
 * proposal has closed there, or a slice the pack judged changed there,
 * the verdict does not stand: the document is put back as the integration
 * branch has it, and the drop is said in the merge message. Nothing here
 * writes a verdict the pack did not record.
 */
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

type IGit = (cwd: string, args: readonly string[]) => string | undefined;

const PROPOSAL_FILE = /(?:^|\/)([a-z]\d{5,})-[^/]*\.md$/iu;

/** The folders a proposal is closed in. */
const CLOSED_FOLDER = /\/(?:done|retired|legacy\/closed)\//u;

/** A frontmatter key a verdict writes. */
const VERDICT_FRONTMATTER =
	/^(?:status|last-transition-[a-z]+|last-correlation-id):/u;

/** A slice line a verdict writes: its status and its review lines. */
const VERDICT_LINE = /^- (?:\*\*Status\*\*:|review-[a-z-]+:)/u;

const SLICE_HEADING = /^### /u;

/** The proposal a path under `proposalsDir` is the document of. */
export const proposalOfPath = (
	path: string,
	proposalsDir: string,
): string | undefined =>
	path.startsWith(`${proposalsDir}/`)
		? PROPOSAL_FILE.exec(path)?.[1]?.toLowerCase()
		: undefined;

const lines = (text: string | undefined): readonly string[] =>
	(text ?? '').split('\n').filter((line) => line.length > 0);

/** A document cut where verdicts write: its frontmatter and its slices. */
interface IDocument {
	/** The frontmatter lines, without the fences; none when it has none. */
	readonly frontmatter: readonly string[];
	/** Everything after the frontmatter, line by line. */
	readonly rest: readonly string[];
	/** Each slice's lines by its heading, heading included. */
	readonly slices: ReadonlyMap<string, readonly string[]>;
}

const parse = (text: string): IDocument => {
	const all = text.split('\n');
	const end = all[0] === '---' ? all.indexOf('---', 1) : -1;
	const rest = end > 0 ? all.slice(end + 1) : all;
	const slices = new Map<string, string[]>();
	let current: string[] | undefined;
	for (const line of rest) {
		if (SLICE_HEADING.test(line)) {
			current = [line];
			slices.set(line, current);
		} else if (line.startsWith('## ')) {
			current = undefined;
		} else {
			current?.push(line);
		}
	}
	return { frontmatter: end > 0 ? all.slice(1, end) : [], rest, slices };
};

const verdictLinesOf = (slice: readonly string[]): string =>
	slice.filter((line) => VERDICT_LINE.test(line)).join('\n');

/** A path to a proposal document, as a slice's files may name its own. */
const DOCUMENT_PATH = /`[^`]*\/([a-z]\d{5,}-[^/`]*\.md)`/giu;

/**
 * What a verdict judges of a slice: everything but its verdict lines. A
 * slice may name its own document among its files, and a transition moves
 * the document and that path with it: where it lies is not the revision.
 */
const revisionOf = (slice: readonly string[]): string =>
	slice
		.filter((line) => !VERDICT_LINE.test(line))
		.join('\n')
		.replace(DOCUMENT_PATH, '`$1`');

/** A slice's status line, and its review lines. */
const STATUS_LINE = /^- \*\*Status\*\*:/u;
const REVIEW_LINE = /^- review-[a-z-]+:/u;

/**
 * Put `pack`'s lines matching `kind` in `slice` in place of its own: where
 * its first one was, else after its last line that is not blank.
 */
const replaceLines = (
	slice: readonly string[],
	pack: readonly string[],
	kind: RegExp,
): readonly string[] => {
	const lines = pack.filter((line) => kind.test(line));
	const first = slice.findIndex((line) => kind.test(line));
	const kept = slice.filter((line) => !kind.test(line));
	let at = first === -1 ? kept.length : first;
	while (first === -1 && at > 1 && kept[at - 1]?.trim() === '') at -= 1;
	return [...kept.slice(0, at), ...lines, ...kept.slice(at)];
};

/** The integration branch's slice with the pack's verdict lines. */
const withVerdict = (
	theirs: readonly string[],
	pack: readonly string[],
): readonly string[] =>
	replaceLines(replaceLines(theirs, pack, STATUS_LINE), pack, REVIEW_LINE);

const keyOf = (line: string): string | undefined =>
	VERDICT_FRONTMATTER.exec(line)?.[0];

/**
 * Apply what the pack changed of the verdict lines (from `base` to `ours`)
 * to the integration branch's document (`theirs`). `undefined` when a slice
 * it judged is not the revision it judged any more.
 */
export const keepPackVerdicts = (input: {
	readonly base: string;
	readonly ours: string;
	readonly theirs: string;
}): string | undefined => {
	const [base, ours, theirs] = [
		parse(input.base),
		parse(input.ours),
		parse(input.theirs),
	];
	const slices = new Map(theirs.slices);
	for (const [heading, slice] of ours.slices) {
		const before = base.slices.get(heading) ?? [];
		if (verdictLinesOf(slice) === verdictLinesOf(before)) continue;
		const now = theirs.slices.get(heading);
		if (now === undefined || revisionOf(now) !== revisionOf(before)) {
			return undefined;
		}
		slices.set(heading, withVerdict(now, slice));
	}
	const valueIn = (doc: IDocument, key: string): string | undefined =>
		doc.frontmatter.find((line) => keyOf(line) === key);
	const frontmatter = theirs.frontmatter.map((line) => {
		const key = keyOf(line);
		const mine = key === undefined ? undefined : valueIn(ours, key);
		return key !== undefined &&
			mine !== undefined &&
			mine !== valueIn(base, key)
			? mine
			: line;
	});
	const out =
		theirs.frontmatter.length > 0 ? ['---', ...frontmatter, '---'] : [];
	let inSlice = false;
	for (const line of theirs.rest) {
		if (SLICE_HEADING.test(line)) {
			inSlice = true;
			out.push(...(slices.get(line) ?? [line]));
			continue;
		}
		if (line.startsWith('## ')) inSlice = false;
		if (!inSlice) out.push(line);
	}
	return out.join('\n');
};

/** The one path a proposal has in a tree, or `undefined`. */
const pathIn = (
	git: IGit,
	dir: string,
	tree: string,
	proposalsDir: string,
	id: string,
): string | undefined =>
	lines(
		git(dir, ['ls-tree', '-r', '--name-only', tree, '--', proposalsDir]),
	).find((path) => proposalOfPath(path, proposalsDir) === id);

/** What became of one conflicting proposal of a pack. */
export interface IVerdictResolution {
	readonly kept: readonly string[];
	readonly dropped: readonly { readonly id: string; readonly why: string }[];
}

/**
 * In a merge of the integration branch into a review pack stopped by
 * conflicts, resolve every conflicting proposal document: the pack's
 * verdicts kept where they still apply, dropped with a note where they do
 * not. Conflicts outside proposal documents are left as they are, for
 * whoever resolves those.
 */
export const resolveVerdictConflicts = (input: {
	readonly dir: string;
	readonly proposalsDir: string;
	readonly git: IGit;
}): IVerdictResolution => {
	const { dir, proposalsDir, git } = input;
	const conflicted = [
		...new Set(
			lines(git(dir, ['diff', '--name-only', '--diff-filter=U'])).flatMap(
				(path) => proposalOfPath(path, proposalsDir) ?? [],
			),
		),
	];
	const kept: string[] = [];
	const dropped: { id: string; why: string }[] = [];
	if (conflicted.length === 0) return { kept, dropped };
	const base = git(dir, ['merge-base', 'HEAD', 'MERGE_HEAD']) ?? '';
	const show = (
		tree: string,
		path: string | undefined,
	): string | undefined =>
		path === undefined ? undefined : git(dir, ['show', `${tree}:${path}`]);
	for (const id of conflicted) {
		const at = (tree: string) => pathIn(git, dir, tree, proposalsDir, id);
		const [basePath, oursPath, theirsPath] = [
			at(base),
			at('HEAD'),
			at('MERGE_HEAD'),
		];
		const theirs = show('MERGE_HEAD', theirsPath);
		const ours = show('HEAD', oursPath);
		let target = theirsPath;
		let text = theirs;
		let why: string | undefined;
		if (theirsPath === undefined || CLOSED_FOLDER.test(theirsPath)) {
			why = 'the proposal closed on the integration branch';
		} else if (ours === undefined || oursPath === undefined) {
			why = 'the pack no longer carries the document';
		} else {
			const resolved = keepPackVerdicts({
				base: show(base, basePath) ?? '',
				ours,
				theirs: theirs ?? '',
			});
			if (resolved === undefined) {
				why =
					'a slice it judged changed on the integration branch since';
			} else {
				// The pack moved the document only by a transition it recorded,
				// and the transition moved the document's own path with it.
				text =
					oursPath !== basePath && theirsPath !== undefined
						? resolved.split(theirsPath).join(oursPath)
						: resolved;
				if (oursPath !== basePath) target = oursPath;
			}
		}
		// Every place the merge left the document, then the one it goes.
		const everywhere = lines(
			git(dir, ['ls-files', '--', proposalsDir]),
		).filter((path) => proposalOfPath(path, proposalsDir) === id);
		for (const path of new Set(everywhere)) {
			git(dir, ['rm', '-q', '-f', '--cached', '--', path]);
			rmSync(join(dir, path), { force: true });
		}
		if (target !== undefined && text !== undefined) {
			mkdirSync(dirname(join(dir, target)), { recursive: true });
			writeFileSync(join(dir, target), `${text}\n`);
			git(dir, ['add', '--', target]);
		}
		if (why === undefined) kept.push(id);
		else dropped.push({ id, why });
	}
	const message = git(dir, ['rev-parse', '--git-path', 'MERGE_MSG']);
	if (message !== undefined) {
		appendFileSync(
			message.startsWith('/') ? message : `${dir}/${message}`,
			[
				'',
				...(kept.length === 0
					? []
					: [
							`Kept the pack's verdicts on ${kept.join(', ')} over the integration branch's verdict lines; its text is taken everywhere else.`,
						]),
				...dropped.map(
					(entry) =>
						`Dropped the verdicts on ${entry.id}: ${entry.why}, and a verdict on another revision does not stand. It returns to the review queue.`,
				),
				'',
			].join('\n'),
		);
	}
	return { kept, dropped };
};
