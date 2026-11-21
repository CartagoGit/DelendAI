import {
	asArray,
	asRecord,
	authorFrom,
	labelsFrom,
	numberValue,
	parseJsonInput,
	stringValue,
} from './shared';

export interface IForgeIssueListEntry {
	readonly number: number;
	readonly title: string;
	readonly state: string;
	readonly author: string;
	readonly labels: readonly string[];
	readonly url: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export const parseIssueList = (
	input: string | unknown,
): IForgeIssueListEntry[] => {
	const parsed = parseJsonInput(input);
	return asArray(parsed).map((entry) => {
		const record = asRecord(entry);
		return {
			number: numberValue(record.number, record.iid, record.id),
			title: stringValue(record.title),
			state: stringValue(record.state),
			author: authorFrom(record.author),
			labels: labelsFrom(record.labels),
			url: stringValue(record.url, record.web_url),
			createdAt: stringValue(record.createdAt, record.created_at),
			updatedAt: stringValue(record.updatedAt, record.updated_at),
		};
	});
};
