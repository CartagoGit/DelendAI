import {
	asArray,
	asRecord,
	authorFrom,
	labelsFrom,
	numberValue,
	parseJsonInput,
	stringValue,
} from './shared';

export interface IForgeIssueComment {
	readonly author: string;
	readonly body: string;
	readonly createdAt: string;
	readonly url: string;
}

export interface IForgeIssueShow {
	readonly number: number;
	readonly title: string;
	readonly body: string;
	readonly state: string;
	readonly author: string;
	readonly labels: readonly string[];
	readonly comments: readonly IForgeIssueComment[];
	readonly url: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

const parseComment = (entry: unknown): IForgeIssueComment => {
	const record = asRecord(entry);
	return {
		author: authorFrom(record.author ?? record.user),
		body: stringValue(record.body, record.note),
		createdAt: stringValue(record.createdAt, record.created_at),
		url: stringValue(record.url, record.web_url),
	};
};

export const parseIssueShow = (input: string | unknown): IForgeIssueShow => {
	const record = asRecord(parseJsonInput(input));
	const comments = asArray(record.comments ?? record.notes).map(parseComment);
	return {
		number: numberValue(record.number, record.iid, record.id),
		title: stringValue(record.title),
		body: stringValue(record.body, record.description),
		state: stringValue(record.state),
		author: authorFrom(record.author),
		labels: labelsFrom(record.labels),
		comments,
		url: stringValue(record.url, record.web_url),
		createdAt: stringValue(record.createdAt, record.created_at),
		updatedAt: stringValue(record.updatedAt, record.updated_at),
	};
};
