export type CommitType =
	| 'feat'
	| 'fix'
	| 'docs'
	| 'refactor'
	| 'perf'
	| 'test'
	| 'build'
	| 'ci'
	| 'chore'
	| 'style'
	| 'revert'
	| 'breaking'
	| 'other';

export interface IConventionalCommit {
	readonly type: CommitType;
	readonly scope?: string;
	readonly subject: string;
	readonly body?: string;
	readonly breaking: boolean;
	readonly hash: string;
}

const COMMIT_TYPE_PATTERN =
	/^(feat|fix|docs|refactor|perf|test|build|ci|chore|style|revert)(?:\(([^)]+)\))?(!)?:\s+(.+)$/u;
const BREAKING_FOOTER_PATTERN = /(^|\n)BREAKING[ -]CHANGE:\s+/u;

export const parseConventionalCommit = (
	line: string,
): IConventionalCommit | null => {
	const normalized = line.trim();
	if (normalized.length === 0) return null;
	const [header = '', ...bodyLines] = normalized.split(/\r?\n/u);
	const headerMatch = /^([0-9a-f]{7,40})\s+(.+)$/u.exec(header.trim());
	if (headerMatch === null) return null;
	const hash = headerMatch[1] ?? '';
	const rawSubject = headerMatch[2] ?? '';
	const body = bodyLines.join('\n').trim();
	const footerBreaking = BREAKING_FOOTER_PATTERN.test(body);
	const conventionalMatch = COMMIT_TYPE_PATTERN.exec(rawSubject);
	if (conventionalMatch !== null) {
		const [, rawType = 'other', rawScope, bang, subject = rawSubject] =
			conventionalMatch;
		return {
			type: rawType as Exclude<CommitType, 'breaking' | 'other'>,
			...(rawScope !== undefined && rawScope.trim().length > 0
				? { scope: rawScope.trim() }
				: {}),
			subject: subject.trim(),
			...(body.length > 0 ? { body } : {}),
			breaking: bang === '!' || footerBreaking,
			hash,
		};
	}
	return {
		type: 'other',
		subject: rawSubject.trim(),
		...(body.length > 0 ? { body } : {}),
		breaking: footerBreaking,
		hash,
	};
};
