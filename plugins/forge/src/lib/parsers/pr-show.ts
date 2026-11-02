import {
	asArray,
	asRecord,
	authorFrom,
	commentsCountFrom,
	labelsFrom,
	numberValue,
	parseJsonInput,
	stringValue,
} from './shared';

export interface IForgePrCommit {
	readonly sha: string;
	readonly message: string;
	readonly author: string;
	readonly authoredAt: string;
}

export interface IForgePrCheck {
	readonly name: string;
	readonly status: string;
	readonly conclusion: string;
	readonly url: string;
}

export interface IForgePrShow {
	readonly number: number;
	readonly title: string;
	readonly body: string;
	readonly author: string;
	readonly branch: string;
	readonly base: string;
	readonly state: string;
	readonly url: string;
	readonly additions: number;
	readonly deletions: number;
	readonly changedFiles: number;
	readonly reviewStatus: string;
	readonly commits: readonly IForgePrCommit[];
	readonly comments: number;
	readonly checks: readonly IForgePrCheck[];
	readonly labels: readonly string[];
}

const parseCommit = (entry: unknown): IForgePrCommit => {
	const record = asRecord(entry);
	const commit = asRecord(record.commit);
	const source = Object.keys(commit).length > 0 ? commit : record;
	return {
		sha: stringValue(source.oid, source.id, source.sha),
		message: stringValue(
			source.messageHeadline,
			source.title,
			source.message,
		),
		author: authorFrom(asArray(source.authors)[0] ?? source.author),
		authoredAt: stringValue(
			source.authoredDate,
			source.created_at,
			source.committed_date,
		),
	};
};

const parseCheck = (entry: unknown): IForgePrCheck => {
	const record = asRecord(entry);
	return {
		name: stringValue(record.name, record.context, record.stage),
		status: stringValue(record.status),
		conclusion: stringValue(record.conclusion, record.result),
		url: stringValue(record.detailsUrl, record.url, record.web_url),
	};
};

export const parsePrShow = (input: string | unknown): IForgePrShow => {
	const record = asRecord(parseJsonInput(input));
	const statusChecks = asArray(
		record.statusCheckRollup ?? record.checks ?? record.status_checks,
	);
	return {
		number: numberValue(record.number, record.iid, record.id),
		title: stringValue(record.title),
		body: stringValue(record.body, record.description),
		author: authorFrom(record.author),
		branch: stringValue(
			record.headRefName,
			record.source_branch,
			record.sourceBranch,
		),
		base: stringValue(
			record.baseRefName,
			record.target_branch,
			record.targetBranch,
		),
		state: stringValue(record.state),
		url: stringValue(record.url, record.web_url, record.webUrl),
		additions: numberValue(record.additions),
		deletions: numberValue(record.deletions),
		changedFiles: numberValue(
			record.changedFiles,
			record.changed_files_count,
			record.changes_count,
		),
		reviewStatus: stringValue(
			record.reviewDecision,
			record.review_status,
			record.merge_status,
		),
		commits: asArray(record.commits).map(parseCommit),
		comments: commentsCountFrom(record.comments),
		checks: statusChecks
			.map(parseCheck)
			.filter((check) => check.name.length > 0),
		labels: labelsFrom(record.labels),
	};
};
