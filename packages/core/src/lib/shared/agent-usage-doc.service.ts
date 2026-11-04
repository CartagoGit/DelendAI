/**
 * agent-usage-doc.service.ts — a usage page per agent and per model
 * provider, under
 * docs/delendai/models/, built from its catalogue entry and from what it
 * says about itself (its ACP greeting), never from text delendai keeps,
 * and nothing about the machine it was written on.
 *
 * The page records the version it was written for, so it is rewritten
 * when that version or the declaration changes. Between the person's
 * markers, an edit survives every rewrite.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IAcpIntroduction } from '../contracts/interfaces/acp.interface';
import type { ICatalogueProvider } from '../contracts/interfaces/account-finding.interface';
import type { IKnownAgent } from '../contracts/interfaces/declared-agent.interface';
import { USAGE_PAGES_DIR } from '../contracts/constants/agent-usage-doc.constant';
import { writeFileAtomic } from './atomic-write';

const GENERATED = '<!-- delendai:agent-usage generated';
const PERSON_START = '<!-- delendai:person:start -->';
const PERSON_END = '<!-- delendai:person:end -->';

const fingerprint = (
	agent: IKnownAgent,
	intro: IAcpIntroduction | undefined,
): string =>
	createHash('sha256')
		.update(
			JSON.stringify({
				declared: agent.declared ?? null,
				launch: agent.launch ?? null,
				version: intro?.agent.version ?? null,
			}),
		)
		.digest('hex')
		.slice(0, 16);

const list = (items: readonly string[]): string =>
	items.length === 0 ? 'none' : items.map((item) => `\`${item}\``).join(', ');

/** The page for `agent`, keeping `personal` (the text between the person's markers). */
export const renderAgentUsagePage = (input: {
	readonly agent: IKnownAgent;
	readonly introduction?: IAcpIntroduction | undefined;
	readonly personal?: string | undefined;
}): string => {
	const { agent, introduction } = input;
	const launch =
		agent.launch === undefined
			? undefined
			: [agent.launch.command, ...agent.launch.args].join(' ');
	const lines = [
		`${GENERATED} ${fingerprint(agent, introduction)} -->`,
		`# ${agent.name}`,
		'',
		`- **Id**: \`${agent.id}\` (${agent.origin})`,
		`- **Reached as**: ${agent.kind}${launch === undefined ? '' : `, started with \`${launch}\``}`,
		...(introduction === undefined
			? [
					'- **Says about itself**: not asked yet (`delendai agents show ' +
						agent.id +
						'`)',
				]
			: [
					`- **Version written for**: ${introduction.agent.version ?? 'unknown'} (ACP protocol ${String(introduction.protocolVersion)})`,
					`- **Logs in with**: ${list(introduction.authMethods)}`,
					`- **Takes in prompts**: text${introduction.promptCapabilities.length === 0 ? '' : `, ${introduction.promptCapabilities.join(', ')}`}`,
					`- **Resumes sessions**: ${introduction.loadSession ? 'yes' : 'no'}`,
				]),
		// What this machine shows stays out: the page is shared, the machine is not.
		...(agent.declared?.keyVariables === undefined
			? []
			: [`- **Key variables**: ${list(agent.declared.keyVariables)}`]),
		'',
		'## Notes',
		'',
		PERSON_START,
		input.personal ??
			'Anything written here is kept when the page is regenerated.',
		PERSON_END,
		'',
	];
	return lines.join('\n');
};

const personalPart = (page: string): string | undefined => {
	const start = page.indexOf(PERSON_START);
	const end = page.indexOf(PERSON_END);
	return start === -1 || end < start
		? undefined
		: page.slice(start + PERSON_START.length, end).trim();
};

/** Write `render`'s page at `<workspace>/<USAGE_PAGES_DIR>/<id>.md`, keeping the person's part. */
const writeUsagePage = async (
	workspace: string,
	id: string,
	render: (personal: string | undefined) => string,
): Promise<{
	readonly path: string;
	readonly written: boolean;
	readonly reason: string;
}> => {
	const dir = join(workspace, USAGE_PAGES_DIR);
	const path = join(dir, `${id.replace(/[^a-z0-9.-]/giu, '-')}.md`);
	const current = await readFile(path, 'utf8').catch(() => undefined);
	if (current !== undefined && !current.startsWith(GENERATED))
		return {
			path,
			written: false,
			reason: 'a page written by hand is never replaced',
		};
	const next = render(
		current === undefined ? undefined : personalPart(current),
	);
	if (current === next) return { path, written: false, reason: 'unchanged' };
	await mkdir(dir, { recursive: true });
	await writeFileAtomic(path, next);
	return {
		path,
		written: true,
		reason:
			current === undefined
				? 'new'
				: 'its version or declaration changed',
	};
};

/**
 * Write the page of `agent` into `workspace`; `false` when it already says
 * the same. A page without the generated marker is a person's own and is
 * left alone.
 */
export const writeAgentUsagePage = (input: {
	readonly workspace: string;
	readonly agent: IKnownAgent;
	readonly introduction?: IAcpIntroduction | undefined;
}) =>
	writeUsagePage(input.workspace, input.agent.id, (personal) =>
		renderAgentUsagePage({
			agent: input.agent,
			introduction: input.introduction,
			personal,
		}),
	);

/**
 * The page of a model provider, from its own catalogue entry: how it is
 * reached (its API family and URL), how it logs in (its key variables, by
 * name) and its models, with the catalogue's date it was written for.
 * Nothing delendai keeps beside the entry, nothing about the machine.
 */
export const renderProviderUsagePage = (input: {
	readonly provider: ICatalogueProvider;
	/** When the catalogue the entry came from was read. */
	readonly catalogueDate?: string | undefined;
	readonly personal?: string | undefined;
}): string => {
	const { provider } = input;
	const print = createHash('sha256')
		.update(JSON.stringify({ provider, date: input.catalogueDate ?? null }))
		.digest('hex')
		.slice(0, 16);
	return [
		`${GENERATED} ${print} -->`,
		`# ${provider.name}`,
		'',
		`- **Id**: \`${provider.id}\` (model provider)`,
		`- **Reached through**: ${provider.npm === undefined ? 'no API family named' : `the \`${provider.npm}\` family`}${provider.api === undefined ? '' : ` at ${provider.api}`}`,
		`- **Logs in with**: ${provider.env.length === 0 ? 'no key variable named' : `a key in ${list(provider.env)}`}`,
		`- **Models**: ${list(provider.models)}`,
		...(provider.doc === undefined
			? []
			: [`- **Its documentation**: ${provider.doc}`]),
		`- **Written for**: the model catalogue of ${input.catalogueDate ?? 'an unknown date'}`,
		'',
		'## Notes',
		'',
		PERSON_START,
		input.personal ??
			'Anything written here is kept when the page is regenerated.',
		PERSON_END,
		'',
	].join('\n');
};

/** Write the page of a model provider into `workspace`, as `writeAgentUsagePage` does. */
export const writeProviderUsagePage = (input: {
	readonly workspace: string;
	readonly provider: ICatalogueProvider;
	readonly catalogueDate?: string | undefined;
}) =>
	writeUsagePage(input.workspace, input.provider.id, (personal) =>
		renderProviderUsagePage({
			provider: input.provider,
			catalogueDate: input.catalogueDate,
			personal,
		}),
	);
