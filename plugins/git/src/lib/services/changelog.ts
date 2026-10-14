/**
 * changelog.ts — build a conventional-commit changelog + infer the semver
 * bump from a git log range. The parsing + grouping + bump inference are pure
 * (unit-tested); `gitChangelog` composes the injected git runner. Offline.
 */
import type {
	IChangelog,
	IChangelogEntry,
	IChangelogGroup,
	IConventionalCommit,
	SemverBump,
} from '../contracts/interfaces/changelog.interface';
import type { IGitRunner } from './git';

/** `type(scope)!: subject` — the Conventional Commits header grammar. */
const HEADER = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

/** Display order for known types; unknown types sort after, alphabetically. */
const TYPE_ORDER = [
	'feat',
	'fix',
	'perf',
	'refactor',
	'docs',
	'test',
	'build',
	'ci',
	'chore',
	'revert',
];

/**
 * Parse `{hash, subject, body?}` records into conventional commits (others
 * ignored). x00185 (F15): the breaking marker is tested against
 * `subject + body` combined — Conventional Commits 1.0.0 puts
 * `BREAKING CHANGE: ...` in the commit BODY as a footer far more often
 * than in the (deliberately short) subject line; checking the subject
 * alone silently classified those as a non-breaking bump.
 */
export const parseConventionalCommits = (
	lines: readonly {
		hash: string;
		subject: string;
		body?: string | undefined;
	}[],
): IConventionalCommit[] => {
	const out: IConventionalCommit[] = [];
	for (const { hash, subject, body } of lines) {
		const match = HEADER.exec(subject);
		if (match === null) continue;
		const type = (match[1] ?? '').toLowerCase();
		const scope = match[2];
		const breaking =
			match[3] === '!' ||
			/BREAKING CHANGE/.test(`${subject}\n${body ?? ''}`);
		out.push({
			hash,
			type,
			...(scope !== undefined ? { scope } : {}),
			breaking,
			subject: match[4] ?? '',
		});
	}
	return out;
};

/** Infer the semver bump: any breaking → major, any feat → minor, else patch. */
export const inferBump = (
	commits: readonly IConventionalCommit[],
): SemverBump => {
	if (commits.length === 0) return 'none';
	if (commits.some((c) => c.breaking)) return 'major';
	if (commits.some((c) => c.type === 'feat')) return 'minor';
	return 'patch';
};

const typeRank = (type: string): number => {
	const index = TYPE_ORDER.indexOf(type);
	return index < 0 ? TYPE_ORDER.length : index;
};

/** Group commits by type (known types first) + infer the bump. Pure. */
export const buildChangelog = (
	commits: readonly IConventionalCommit[],
): IChangelog => {
	const byType = new Map<string, IChangelogEntry[]>();
	for (const commit of commits) {
		const entries = byType.get(commit.type) ?? [];
		entries.push({
			hash: commit.hash,
			...(commit.scope !== undefined ? { scope: commit.scope } : {}),
			subject: commit.subject,
			breaking: commit.breaking,
		});
		byType.set(commit.type, entries);
	}
	const groups: IChangelogGroup[] = [...byType.entries()]
		.map(([type, entries]) => ({ type, entries }))
		.sort(
			(a, b) =>
				typeRank(a.type) - typeRank(b.type) ||
				a.type.localeCompare(b.type),
		);
	return { groups, bump: inferBump(commits), total: commits.length };
};

/**
 * Build a changelog for a commit range. `range` (e.g. `v1.0.0..HEAD`) is used
 * verbatim when given; otherwise the last `limit` commits (default 100). Never
 * throws — a failed git call yields an empty changelog.
 */
export const gitChangelog = async (
	run: IGitRunner,
	options: { range?: string; limit?: number } = {},
): Promise<IChangelog> => {
	const args = [
		'log',
		...(options.range !== undefined && options.range !== ''
			? [options.range]
			: ['-n', String(options.limit ?? 100)]),
		'--no-merges',
		// x00185 (F15): %b (body) is where Conventional Commits 1.0.0 puts
		// a `BREAKING CHANGE:` footer — the subject line alone almost
		// never carries it. %b can itself contain newlines, so records
		// are separated by %x1e (not "\n") to keep one commit's
		// multi-line body from being split into several bogus records.
		'--pretty=format:%h%x1f%s%x1f%b%x1e',
	];
	const result = await run(args);
	if (!result.ok) return { groups: [], bump: 'none', total: 0 };
	const lines = result.output
		.split('\x1e')
		.map((record) => record.replace(/^\n+/, '').replace(/\n+$/, ''))
		.filter((record) => record.length > 0)
		.map((record) => {
			const [hash, subject, body] = record.split('\x1f');
			return { hash: hash ?? '', subject: subject ?? '', body };
		});
	return buildChangelog(parseConventionalCommits(lines));
};
