/**
 * agent-detection.service.ts — which agents this machine has, found with
 * the public catalogues as the only vocabulary.
 *
 * A registry agent is found by its own names: its id, its name, the
 * executable its release runs, the package it is published as. They are
 * looked for on PATH, among globally installed packages, and among IDE
 * extensions. An executable no catalogue names is asked for its help only
 * when its name carries a word the catalogues use (a provider, a model
 * family, an agent). It is offered when that help speaks ACP or names a
 * key variable or a provider. No vendor is listed here.
 */
import type { IModelCatalogue } from '../contracts/interfaces/account-finding.interface';
import type {
	IDetectedAgent,
	IDetectionMachine,
} from '../contracts/interfaces/agent-detection.interface';
import type {
	IAgentRegistry,
	IRegistryAgent,
} from '../contracts/interfaces/public-catalogue.interface';

/** At most this many unknown executables are asked for their help. */
const MAX_HELP_PROBES = 20;
/** Words shorter than this match too much to stand for a provider. */
const MIN_WORD = 4;
const SUFFIXES = /-(acp|cli|code|agent)$/u;

const bare = (name: string): string =>
	name
		.toLowerCase()
		.replace(/^\.\//u, '')
		.replace(/\.(exe|cmd)$/u, '');

/** `@scope/name@1.2.3` → `@scope/name`; `name@1` → `name`. */
export const packageName = (spec: string): string =>
	spec.startsWith('@')
		? `@${spec.slice(1).split('@')[0] ?? ''}`
		: (spec.split('@')[0] ?? spec);

/** Every name an agent may be installed under. */
export const namesOf = (agent: IRegistryAgent): ReadonlySet<string> => {
	const names = new Set<string>([
		bare(agent.id),
		bare(agent.id).replace(SUFFIXES, ''),
		bare(agent.name).replace(/\s+/gu, '-'),
	]);
	for (const build of Object.values(agent.distribution.binary ?? {}))
		names.add(bare(build.cmd.split(/[\\/]/u).pop() ?? build.cmd));
	for (const launch of [agent.distribution.npx, agent.distribution.uvx]) {
		if (launch === undefined) continue;
		// A scoped package's last part (`@x/code`) is too generic to stand for it.
		const pkg = packageName(launch.package);
		if (!pkg.startsWith('@')) names.add(pkg.toLowerCase());
	}
	return names;
};

const packagesOf = (agent: IRegistryAgent): readonly string[] =>
	[agent.distribution.npx, agent.distribution.uvx].flatMap((launch) =>
		launch === undefined ? [] : [packageName(launch.package)],
	);

/** The words the catalogues use: provider ids, model families, agent names. */
export const catalogueWords = (
	registry: IAgentRegistry | undefined,
	catalogue: IModelCatalogue | undefined,
): ReadonlySet<string> => {
	const words = new Set<string>();
	for (const provider of catalogue?.providers ?? []) {
		words.add(provider.id.split('-')[0] ?? provider.id);
		for (const model of provider.models) {
			const family = /^[a-z]+/u.exec(
				model.split('/').pop()?.toLowerCase() ?? '',
			)?.[0];
			if (family !== undefined) words.add(family);
		}
	}
	for (const agent of registry?.agents ?? [])
		for (const name of namesOf(agent)) words.add(name);
	return new Set([...words].filter((word) => word.length >= MIN_WORD));
};

const helpSpeaksAi = (
	help: string,
	catalogue: IModelCatalogue | undefined,
): string | undefined => {
	if (/\bacp\b|agent client protocol/iu.test(help))
		return 'its help mentions ACP';
	const variable = /\b[A-Z][A-Z0-9]*_(API_KEY|TOKEN)\b/u.exec(help)?.[0];
	if (variable !== undefined) return `its help names ${variable}`;
	// A provider's name alone is common prose (`Google`); with models it is an AI tool.
	if (!/\bmodels?\b/iu.test(help)) return undefined;
	const provider = catalogue?.providers.find(
		(each) => each.name.length >= MIN_WORD && help.includes(each.name),
	);
	return provider === undefined
		? undefined
		: `its help names ${provider.name}`;
};

/**
 * `sst-dev.opencode-0.0.13` → `opencode`; `anthropic.claude-code-2.1.3-linux-x64`
 * → `claude-code` and `claude`. A whole name, never a substring.
 */
export const extensionNames = (id: string): readonly string[] => {
	const lower = id.toLowerCase();
	const name = (lower.split('.').slice(1).join('.') || lower).replace(
		/-\d[\w.-]*$/u,
		'',
	);
	return [name, name.replace(SUFFIXES, '')];
};

const tokensOf = (name: string): readonly string[] => [
	name,
	...name.split(/[-_.]/u),
];

/** An extension that files itself under AI or chat, by its own manifest. */
const aiExtension = (manifest: string | undefined): boolean => {
	if (manifest === undefined) return false;
	try {
		const parsed = JSON.parse(manifest) as { categories?: unknown };
		return (
			Array.isArray(parsed.categories) &&
			parsed.categories.some(
				(category) =>
					typeof category === 'string' &&
					/^(ai|chat|machine learning)$/iu.test(category),
			)
		);
	} catch {
		return false;
	}
};

/** Every agent the machine shows, registry ones first. */
export const detectAgents = async (input: {
	readonly machine: IDetectionMachine;
	readonly registry: IAgentRegistry | undefined;
	readonly catalogue?: IModelCatalogue | undefined;
}): Promise<readonly IDetectedAgent[]> => {
	const [executables, packages, extensions] = await Promise.all([
		input.machine.executables(),
		input.machine.globalPackages(),
		input.machine.ideExtensions(),
	]);
	const onPath = new Map(executables.map((name) => [bare(name), name]));
	const installed = new Set(
		packages.map((name) => packageName(name).toLowerCase()),
	);
	const found: IDetectedAgent[] = [];
	const claimed = new Set<string>();
	for (const agent of input.registry?.agents ?? []) {
		const names = namesOf(agent);
		const executable = [...names].find((name) => onPath.has(name));
		if (executable !== undefined) {
			claimed.add(executable);
			found.push({
				registryId: agent.id,
				name: agent.name,
				foundIn: 'path',
				evidence: `${onPath.get(executable) ?? executable} is on PATH`,
				executable: onPath.get(executable) ?? executable,
			});
		}
		const pkg = packagesOf(agent).find((name) =>
			installed.has(name.toLowerCase()),
		);
		if (pkg !== undefined)
			found.push({
				registryId: agent.id,
				name: agent.name,
				foundIn: 'package',
				evidence: `${pkg} is installed globally`,
			});
		const extension = extensions.find((each) =>
			extensionNames(each.id).some((name) => names.has(name)),
		);
		if (extension !== undefined)
			found.push({
				registryId: agent.id,
				name: agent.name,
				foundIn: 'ide',
				evidence: `${extension.ide} has the extension ${extension.id}`,
			});
	}
	const placed = new Set(
		found.flatMap((each) =>
			each.foundIn === 'ide' ? [each.evidence] : [],
		),
	);
	// One line per extension, whatever versions are kept side by side.
	const seen = new Set<string>();
	for (const extension of extensions) {
		const evidence = `${extension.ide} has the extension ${extension.id}`;
		const key = `${extension.ide}:${extension.id.split('.')[0] ?? ''}.${extensionNames(extension.id)[0] ?? ''}`;
		if (placed.has(evidence) || seen.has(key)) continue;
		if (!aiExtension(extension.manifest)) continue;
		seen.add(key);
		found.push({
			name: extension.id,
			foundIn: 'ide',
			evidence: `${evidence}, filed under AI`,
		});
	}
	const words = catalogueWords(input.registry, input.catalogue);
	const candidates = [...onPath.keys()]
		.filter((name) => !claimed.has(name))
		.filter((name) => tokensOf(name).some((token) => words.has(token)))
		.slice(0, MAX_HELP_PROBES);
	for (const name of candidates) {
		const why = helpSpeaksAi(
			await input.machine.help(onPath.get(name) ?? name),
			input.catalogue,
		);
		if (why !== undefined)
			found.push({
				name,
				foundIn: 'path-candidate',
				evidence: `${name} is on PATH and ${why}`,
			});
	}
	return found;
};
