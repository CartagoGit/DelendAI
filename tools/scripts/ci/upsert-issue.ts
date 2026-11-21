/**
 * upsert-issue.ts — keep ONE open issue per kind of bot report.
 *
 * A bot that runs on every failure and calls `gh issue create` files a new
 * issue each time. A kind is its title: this finds the open issues with it,
 * refreshes the first one's body, closes the others as duplicates, and closes
 * them all with a comment once the condition clears.
 */

/** The few forge calls the upsert needs; specs inject a fake. */
export interface IIssueForge {
	/** Numbers of the open issues whose title is exactly `title`, oldest first. */
	readonly listOpen: (title: string) => Promise<readonly number[]>;
	readonly create: (title: string, body: string) => Promise<void>;
	readonly edit: (number: number, body: string) => Promise<void>;
	readonly close: (number: number, comment: string) => Promise<void>;
}

/** What the upsert did, for the log line. */
export type UpsertOutcome = 'created' | 'updated' | 'closed' | 'unchanged';

/** Writes the issue for a kind while its condition holds. */
export const upsertIssue = async (
	forge: IIssueForge,
	title: string,
	body: string,
): Promise<UpsertOutcome> => {
	const [first, ...duplicates] = [...(await forge.listOpen(title))].sort(
		(a, b) => a - b,
	);
	for (const number of duplicates)
		await forge.close(number, `Duplicate of #${String(first)}.`);
	if (first === undefined) {
		await forge.create(title, body);
		return 'created';
	}
	await forge.edit(first, body);
	return 'updated';
};

/** Closes every open issue of the kind once its condition cleared. */
export const closeClearedIssues = async (
	forge: IIssueForge,
	title: string,
	comment: string,
): Promise<UpsertOutcome> => {
	const open = await forge.listOpen(title);
	for (const number of open) await forge.close(number, comment);
	return open.length === 0 ? 'unchanged' : 'closed';
};
