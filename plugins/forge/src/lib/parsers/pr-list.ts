import {
	asArray,
	asRecord,
	authorFrom,
	booleanValue,
	labelsFrom,
	numberValue,
	parseJsonInput,
	stringValue,
} from './shared';

export interface IForgePrListEntry {
	readonly number: number;
	readonly title: string;
	readonly author: string;
	readonly branch: string;
	readonly base: string;
	readonly url: string;
	readonly state: string;
	readonly draft: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly labels: readonly string[];
}

export const parsePrList = (input: string | unknown): IForgePrListEntry[] => {
	const parsed = parseJsonInput(input);
	const entries = asArray(parsed);
	return entries.map((entry) => {
		const record = asRecord(entry);
		return {
			number: numberValue(record.number, record.iid, record.id),
			title: stringValue(record.title),
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
			url: stringValue(record.url, record.web_url, record.webUrl),
			state: stringValue(record.state),
			draft: booleanValue(
				record.isDraft,
				record.draft,
				record.work_in_progress,
			),
			createdAt: stringValue(record.createdAt, record.created_at),
			updatedAt: stringValue(record.updatedAt, record.updated_at),
			labels: labelsFrom(record.labels),
		};
	});
};
