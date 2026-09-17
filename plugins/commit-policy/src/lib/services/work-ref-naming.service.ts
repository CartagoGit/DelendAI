/**
 * What a work ref is called: who did the work and what the work is.
 *
 * A ref named `wip/DESKTOP-9CTQRS7/f00057-S3-g1-work` says neither. The
 * machine name was used because the agent identity came only from
 * configuration that no host writes, and `work` because nothing supplied
 * a topic. Both are now resolved from what every host already has: the
 * name its MCP client reports at the handshake, and the slice title in
 * the proposal.
 */
import { type IGitRunner, SafeWorkspaceReader } from '@delendai/core/public';

/** Everything that can name the agent, most specific first. */
export interface IWorkRefAgentSources {
	readonly model?: string | undefined;
	readonly host?: string | undefined;
	readonly clientName?: () => string | undefined;
	readonly machineName: () => string;
}

/** A fixed id, or one resolved when the ref is named. */
export type IWorkRefAgentId = string | (() => string);

const nonEmpty = (value: string | undefined): string | undefined =>
	value !== undefined && value.trim().length > 0 ? value.trim() : undefined;

/**
 * The agent a work ref is named after: the declared model, the declared
 * host, the MCP client name, and only then the machine. Resolved on every
 * call, because the client name is known only after the handshake.
 */
export const workRefAgent =
	(sources: IWorkRefAgentSources): (() => string) =>
	() =>
		(
			nonEmpty(sources.model) ??
			nonEmpty(sources.host) ??
			nonEmpty(sources.clientName?.()) ??
			sources.machineName()
		).toLowerCase();

export const agentIdOf = (agentId: IWorkRefAgentId): string =>
	typeof agentId === 'function' ? agentId() : agentId;

const TOPIC_MAX_LENGTH = 48;

/** Lowercase kebab words, cut at a word boundary within the limit. */
export const topicSlug = (text: string): string | undefined => {
	const words = text
		.normalize('NFKD')
		.replaceAll(/[̀-ͯ]/gu, '')
		.toLowerCase()
		.split(/[^a-z0-9]+/u)
		.filter((word) => word.length > 0);
	let slug = '';
	for (const word of words) {
		const next = slug === '' ? word : `${slug}-${word}`;
		if (next.length > TOPIC_MAX_LENGTH) break;
		slug = next;
	}
	return slug === '' ? undefined : slug;
};

const escapeRegExp = (value: string): string =>
	value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * The topic of one slice, from its `### S1 — Title` heading. Returns
 * `undefined` when the slice has no heading or its title has no words.
 */
export const topicFromProposalText = (
	text: string,
	sliceId: string,
): string | undefined => {
	const heading = new RegExp(
		`^#{2,4}\\s+${escapeRegExp(sliceId)}\\b[\\s:.\\-—–]*(.*)$`,
		'mu',
	).exec(text);
	return heading?.[1] === undefined ? undefined : topicSlug(heading[1]);
};

/** The topic from `<id>-<slug>.md` when the slice itself has none. */
export const topicFromProposalFilename = (
	fileName: string,
	proposalId: string,
): string | undefined => {
	const base = fileName.replace(/\.md$/u, '');
	return base.startsWith(`${proposalId}-`)
		? topicSlug(base.slice(proposalId.length + 1))
		: undefined;
};

/**
 * Resolve a slice's topic by reading its proposal from the working tree
 * (tracked or not, so a proposal written this session counts). Any
 * failure yields `undefined`: a missing topic must never fail a
 * checkpoint, it only makes the ref less descriptive.
 */
export const createSliceTopicResolver =
	(input: {
		readonly run: IGitRunner;
		readonly workspaceRoot: string;
		readonly proposalsDir: string;
	}) =>
	async (request: {
		readonly proposalId: string;
		readonly sliceId: string;
	}): Promise<string | undefined> => {
		if (request.proposalId.length === 0) return undefined;
		const listed = await input.run([
			'ls-files',
			'--cached',
			'--others',
			'--exclude-standard',
			'--',
			input.proposalsDir,
		]);
		if (!listed.ok) return undefined;
		const path = listed.output
			.split('\n')
			.map((line) => line.trim())
			.find((line) =>
				(line.split('/').at(-1) ?? '').startsWith(
					`${request.proposalId}-`,
				),
			);
		if (path === undefined) return undefined;
		const fileName = path.split('/').at(-1) ?? '';
		const fromFile = topicFromProposalFilename(
			fileName,
			request.proposalId,
		);
		if (request.sliceId.length === 0) return fromFile;
		const text = await new SafeWorkspaceReader(input.workspaceRoot)
			.readText(path)
			.then((read) => read.content)
			.catch(() => undefined);
		return (
			(text === undefined
				? undefined
				: topicFromProposalText(text, request.sliceId)) ?? fromFile
		);
	};
