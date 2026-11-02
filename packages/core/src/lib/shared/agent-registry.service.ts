/**
 * agent-registry.service.ts — the public registry of coding agents (the
 * Agent Client Protocol registry), read in layers like the model catalogue.
 *
 * Each agent comes with how its publisher distributes it: an npx or uvx
 * package with its arguments, or per-platform release archives with
 * their sha256. Every agent it lists speaks ACP, so one driver reaches
 * all of them and a new one needs no delendai release.
 */
import {
	AGENT_REGISTRY_FORMAT,
	DEFAULT_CATALOGUE_SOURCES,
} from '../contracts/constants/public-catalogues.constant';
import type {
	IAgentBinaryLaunch,
	IAgentDistribution,
	IAgentPackageLaunch,
	IAgentRegistry,
	ICatalogueConditionalFetch,
	ICatalogueCopy,
	IRegistryAgent,
} from '../contracts/interfaces/public-catalogue.interface';
import { readPublicCatalogue } from './public-catalogue-sources.service';

type IRecord = Readonly<Record<string, unknown>>;

const record = (value: unknown): IRecord | undefined =>
	value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as IRecord)
		: undefined;

const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

const texts = (value: unknown): readonly string[] | undefined =>
	Array.isArray(value)
		? value.filter((each): each is string => typeof each === 'string')
		: undefined;

const strings = (
	value: unknown,
): Readonly<Record<string, string>> | undefined => {
	const entries = Object.entries(record(value) ?? {}).filter(
		(entry): entry is [string, string] => typeof entry[1] === 'string',
	);
	return entries.length === 0 ? undefined : Object.fromEntries(entries);
};

const packageLaunch = (value: unknown): IAgentPackageLaunch | undefined => {
	const entry = record(value);
	const name = text(entry?.package);
	return name === undefined
		? undefined
		: { package: name, args: texts(entry?.args), env: strings(entry?.env) };
};

const binaryLaunch = (value: unknown): IAgentBinaryLaunch | undefined => {
	const entry = record(value);
	const archive = text(entry?.archive);
	const cmd = text(entry?.cmd);
	return archive === undefined || cmd === undefined
		? undefined
		: {
				archive,
				cmd,
				args: texts(entry?.args),
				sha256: text(entry?.sha256),
			};
};

const distributionOf = (value: unknown): IAgentDistribution => {
	const entry = record(value) ?? {};
	const binary = Object.entries(record(entry.binary) ?? {}).flatMap(
		([platform, launch]) => {
			const parsed = binaryLaunch(launch);
			return parsed === undefined ? [] : [[platform, parsed] as const];
		},
	);
	return {
		npx: packageLaunch(entry.npx),
		uvx: packageLaunch(entry.uvx),
		binary: binary.length === 0 ? undefined : Object.fromEntries(binary),
	};
};

/** The raw registry reduced to what finding and launching an agent need. */
export const compactAgentRegistry = (
	raw: unknown,
): IAgentRegistry | undefined => {
	const list = record(raw)?.agents;
	if (!Array.isArray(list)) return undefined;
	const agents: IRegistryAgent[] = list.flatMap((value) => {
		const entry = record(value);
		const id = text(entry?.id);
		if (entry === undefined || id === undefined) return [];
		return [
			{
				id,
				name: text(entry.name) ?? id,
				version: text(entry.version) ?? '',
				description: text(entry.description),
				repository: text(entry.repository),
				distribution: distributionOf(entry.distribution),
			},
		];
	});
	return agents.length === 0 ? undefined : { agents };
};

export const shippedAgentRegistry = async (): Promise<
	ICatalogueCopy<IAgentRegistry> | undefined
> =>
	(await import('../../../data/agent-registry.snapshot.json'))
		.default as unknown as ICatalogueCopy<IAgentRegistry>;

/** The registry from the first layer that has one. Never throws. */
export const readAgentRegistry = async (
	input: {
		readonly sources?: readonly string[] | undefined;
		readonly cacheDir?: string | undefined;
		readonly now?: Date | undefined;
		readonly fetch?: ICatalogueConditionalFetch | undefined;
		readonly snapshot?:
			| (() => Promise<ICatalogueCopy<IAgentRegistry> | undefined>)
			| undefined;
	} = {},
): Promise<IAgentRegistry | undefined> =>
	(
		await readPublicCatalogue({
			kind: 'agents',
			sources: input.sources ?? DEFAULT_CATALOGUE_SOURCES.agents,
			compact: compactAgentRegistry,
			format: AGENT_REGISTRY_FORMAT,
			snapshot: input.snapshot ?? shippedAgentRegistry,
			cacheDir: input.cacheDir,
			now: input.now,
			fetch: input.fetch,
		})
	)?.data;
