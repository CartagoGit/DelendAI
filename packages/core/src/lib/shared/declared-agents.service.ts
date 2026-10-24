/**
 * declared-agents.service.ts — every agent delendai knows, from the
 * registry, from the project's and the person's declarations, and from
 * what the machine shows; and the install of a registry agent's binary.
 *
 * A declaration overrides the registry entry of the same id; the person's
 * overrides the project's. A registry agent is listed when the machine
 * shows it or when asked for all. A binary is installed only from the
 * archive the registry names, and only when its sha256 matches.
 */
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { IAcpLaunch } from '../contracts/interfaces/acp.interface';
import type { IDetectedAgent } from '../contracts/interfaces/agent-detection.interface';
import type {
	IDeclaredAgent,
	IKnownAgent,
} from '../contracts/interfaces/declared-agent.interface';
import type {
	IAgentRegistry,
	IRegistryAgent,
} from '../contracts/interfaces/public-catalogue.interface';
import { acpLaunchOf, registryPlatform } from './acp-client.service';
import { runArgv } from './run-command';

/** Where installed agent binaries live: one folder per id and version. */
export const agentInstallDir = (
	agent: Pick<IRegistryAgent, 'id' | 'version'>,
	root: string = join(homedir(), '.local', 'share', 'delendai', 'agents'),
): string => join(root, agent.id, agent.version || 'unversioned');

/** How a declared agent is started over ACP; nothing for another kind. */
export const declaredLaunch = (
	agent: IDeclaredAgent,
	platform?: string,
): IAcpLaunch | undefined => {
	if (agent.kind !== 'acp') return undefined;
	if (agent.command !== undefined)
		return { command: agent.command, args: agent.args ?? [] };
	return agent.distribution === undefined
		? undefined
		: acpLaunchOf(
				{
					id: agent.id,
					name: agent.name ?? agent.id,
					version: '',
					distribution: agent.distribution,
				},
				platform === undefined ? {} : { platform },
			);
};

/**
 * A registry agent released as a binary that is already on PATH (installed
 * its own way): started by that executable, with the arguments its
 * release names for ACP.
 */
const onPathLaunch = (
	agent: IRegistryAgent,
	found: readonly IDetectedAgent[],
): IAcpLaunch | undefined => {
	const executable = found.find(
		(each) => each.executable !== undefined,
	)?.executable;
	const builds = Object.values(agent.distribution.binary ?? {});
	const build = agent.distribution.binary?.[registryPlatform()] ?? builds[0];
	return executable === undefined || build === undefined
		? undefined
		: { command: executable, args: [...(build.args ?? [])] };
};

/** Every known agent: declared first (person over project), then the registry's. */
export const knownAgents = (input: {
	readonly registry: IAgentRegistry | undefined;
	readonly project?: readonly IDeclaredAgent[] | undefined;
	readonly personal?: readonly IDeclaredAgent[] | undefined;
	readonly detected?: readonly IDetectedAgent[] | undefined;
	/** List registry agents the machine does not show too. */
	readonly all?: boolean | undefined;
	readonly installedDir?:
		| ((agent: IRegistryAgent) => string | undefined)
		| undefined;
}): readonly IKnownAgent[] => {
	const detected = input.detected ?? [];
	const foundFor = (id: string) =>
		detected.filter((each) => each.registryId === id);
	const byId = new Map<string, IKnownAgent>();
	for (const [origin, list] of [
		['project', input.project],
		['personal', input.personal],
	] as const)
		for (const agent of list ?? [])
			byId.set(agent.id, {
				id: agent.id,
				name: agent.name ?? agent.id,
				kind: agent.kind,
				origin,
				launch: declaredLaunch(agent),
				declared: agent,
				found: foundFor(agent.id),
			});
	for (const agent of input.registry?.agents ?? []) {
		if (byId.has(agent.id)) continue;
		const found = foundFor(agent.id);
		if (found.length === 0 && input.all !== true) continue;
		const installed = input.installedDir?.(agent);
		byId.set(agent.id, {
			id: agent.id,
			name: agent.name,
			kind: 'acp',
			origin: found.length === 0 ? 'registry' : 'detected',
			launch:
				acpLaunchOf(
					agent,
					installed === undefined ? {} : { installedDir: installed },
				) ?? onPathLaunch(agent, found),
			found,
		});
	}
	for (const each of detected)
		if (each.registryId === undefined)
			byId.set(`${each.foundIn}:${each.name}`, {
				id: each.name,
				name: each.name,
				kind: each.foundIn === 'ide' ? 'extension' : 'cli',
				origin: 'detected',
				found: [each],
			});
	return [...byId.values()];
};

/** Download, verify and unpack a registry agent's binary for this platform. */
/** The compression suffixes a tar archive may carry, as tar reads them. */
const TAR_SUFFIXES = ['.gz', '.tgz', '.bz2', '.xz', '.zst'] as const;

/** The file name an archive is saved under: its format, never the registry's name. */
export const archiveName = (url: string): string => {
	const path = url.split(/[?#]/u)[0]?.toLowerCase() ?? '';
	if (path.endsWith('.zip')) return 'archive.zip';
	const suffix = TAR_SUFFIXES.find((each) => path.endsWith(each));
	return suffix === undefined
		? 'archive.tar'
		: `archive.tar${suffix === '.tgz' ? '.gz' : suffix}`;
};

export const installAgentBinary = async (
	agent: IRegistryAgent,
	options: {
		readonly platform?: string | undefined;
		readonly root?: string | undefined;
		readonly download?: ((url: string) => Promise<Uint8Array>) | undefined;
		readonly run?: typeof runArgv | undefined;
	} = {},
): Promise<{ readonly dir: string; readonly launch: IAcpLaunch }> => {
	const platform = options.platform ?? registryPlatform();
	const build = agent.distribution.binary?.[platform];
	if (build === undefined)
		throw new Error(`${agent.id} publishes no binary for ${platform}`);
	if (build.sha256 === undefined)
		throw new Error(
			`${agent.id} names no sha256 for ${platform}: not installed unverified`,
		);
	const bytes = await (
		options.download ??
		(async (url: string) =>
			new Uint8Array(await (await fetch(url)).arrayBuffer()))
	)(build.archive);
	const sum = createHash('sha256').update(bytes).digest('hex');
	if (sum !== build.sha256)
		throw new Error(
			`${build.archive} does not match its sha256 (got ${sum}): not installed`,
		);
	const dir = agentInstallDir(agent, options.root);
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	// The name is delendai's, not the URL's: only the format is read from it.
	const archive = join(dir, archiveName(build.archive));
	await writeFile(archive, bytes);
	const done = await (options.run ?? runArgv)(
		archive.endsWith('.zip')
			? ['unzip', '-o', '-q', archive, '-d', dir]
			: ['tar', '-xf', archive, '-C', dir],
		{ cwd: dir },
	);
	if (done.code !== 0)
		throw new Error(
			`could not unpack ${archive}: ${done.stderr || done.stdout}`,
		);
	await rm(archive, { force: true });
	const launch = acpLaunchOf(agent, { platform, installedDir: dir });
	if (launch === undefined)
		throw new Error(`${agent.id} cannot start from ${dir}`);
	return { dir, launch };
};
