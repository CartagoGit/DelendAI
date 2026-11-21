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
export type IUpsertOutcome = 'created' | 'updated' | 'closed' | 'unchanged';

/** Writes the issue for a kind while its condition holds. */
export const upsertIssue = async (
	forge: IIssueForge,
	title: string,
	body: string,
): Promise<IUpsertOutcome> => {
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
): Promise<IUpsertOutcome> => {
	const open = await forge.listOpen(title);
	for (const number of open) await forge.close(number, comment);
	return open.length === 0 ? 'unchanged' : 'closed';
};

/** Runs `gh` with the given arguments and returns its stdout; specs inject a fake. */
export type IGhRunner = (args: readonly string[]) => string;

/** The forge over the `gh` CLI. */
export const createGhIssueForge = (gh: IGhRunner): IIssueForge => ({
	listOpen: (title) =>
		Promise.resolve(
			(
				JSON.parse(
					gh([
						'issue',
						'list',
						'--state',
						'open',
						'--search',
						`"${title}" in:title`,
						'--json',
						'number,title',
					]),
				) as { number: number; title: string }[]
			)
				.filter((issue) => issue.title === title)
				.map((issue) => issue.number),
		),
	create: (title, body) => {
		gh(['issue', 'create', '--title', title, '--body', body]);
		return Promise.resolve();
	},
	edit: (number, body) => {
		gh(['issue', 'edit', String(number), '--body', body]);
		return Promise.resolve();
	},
	close: (number, comment) => {
		gh(['issue', 'close', String(number), '--comment', comment]);
		return Promise.resolve();
	},
});
