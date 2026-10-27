/**
 * agents-flow.service.ts — the agents a project can use, listed, declared
 * and installed: what `delendai agents` runs.
 *
 * The list joins the public registry, the project's and the person's
 * declarations, and what this machine shows. A declaration goes to the
 * person's own file for this project, checked against the schema first,
 * so nobody edits a file by hand and nothing invalid is written.
 */
import { withDeclaredProviders } from '../shared/declared-providers.helper';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { DECLARED_AGENT_SCHEMA } from '../contracts/constants/declared-agent-schema.constant';
import type {
	IDetectedAgent,
	IDetectionMachine,
} from '../contracts/interfaces/agent-detection.interface';
import type {
	IDeclaredAgent,
	IKnownAgent,
} from '../contracts/interfaces/declared-agent.interface';
import type { IModelCatalogue } from '../contracts/interfaces/account-finding.interface';
import type { IAgentRegistry } from '../contracts/interfaces/public-catalogue.interface';
import { detectAgents } from '../shared/agent-detection.service';
import { readAgentRegistry } from '../shared/agent-registry.service';
import {
	agentInstallDir,
	installAgentBinary,
	knownAgents,
} from '../shared/declared-agents.service';
import { realDetectionMachine } from '../shared/detection-machine.service';
import { readModelCatalogue } from '../shared/model-catalogue.service';
import { catalogueSources } from '../shared/public-catalogue-sources.service';
import { DEFAULT_CONFIG_FILENAME, parseConfigFile } from './load-config-file';
import { addToPersonalLayer } from './personal-layer-writer.service';
import {
	parsePersonalLayer,
	personalLayerPath,
	projectIdentity,
} from './personal-layer.service';

const readText = async (path: string): Promise<string | undefined> =>
	readFile(path, 'utf8').catch(() => undefined);

const layersOf = async (workspace: string, personalRoot?: string) => {
	const personalPath = personalLayerPath(
		await projectIdentity(workspace),
		personalRoot,
	);
	return {
		personalPath,
		personal: parsePersonalLayer(await readText(personalPath)).layer,
		shared: parseConfigFile(
			await readText(join(workspace, DEFAULT_CONFIG_FILENAME)),
		),
	};
};

const isDir = async (path: string): Promise<boolean> =>
	stat(path).then(
		(info) => info.isDirectory(),
		() => false,
	);

/** Every agent this project can reach, and where each came from. */
export const listAgents = async (input: {
	readonly workspace: string;
	readonly all?: boolean | undefined;
	readonly personalRoot?: string | undefined;
	readonly machine?: IDetectionMachine | undefined;
	readonly registry?: IAgentRegistry | undefined;
	/** The model catalogue to name candidates by; read from its layers when absent. */
	readonly catalogue?: IModelCatalogue | undefined;
}): Promise<{
	readonly agents: readonly IKnownAgent[];
	readonly detected: readonly IDetectedAgent[];
	/** Executables that look like agents, not yet answered nor declared. */
	readonly candidates: readonly IDetectedAgent[];
	/** The model catalogue with the declared providers over it. */
	readonly catalogue?: IModelCatalogue | undefined;
}> => {
	const { personal, shared } = await layersOf(
		input.workspace,
		input.personalRoot,
	);
	const configured = [personal.catalogues, shared.catalogues];
	const [registry, catalogued] = await Promise.all([
		input.registry ??
			readAgentRegistry({
				sources: catalogueSources('agents', configured),
			}),
		input.catalogue ??
			readModelCatalogue({
				sources: catalogueSources('models', configured),
			}),
	]);
	// The providers the project and the person declare replace the
	// catalogue's entries of the same id, the person's own last.
	const catalogue = withDeclaredProviders(catalogued, [
		...(shared.modelProviders ?? []),
		...(personal.modelProviders ?? []),
	]);
	const detected = await detectAgents({
		machine:
			input.machine ?? realDetectionMachine({ cwd: input.workspace }),
		registry,
		catalogue,
	});
	const installed = new Map<string, string>();
	for (const agent of registry?.agents ?? []) {
		const dir = agentInstallDir(agent);
		if (agent.distribution.binary !== undefined && (await isDir(dir)))
			installed.set(agent.id, dir);
	}
	const answered = answeredCandidates(personal.declinedOffers);
	const agents = knownAgents({
		registry,
		project: shared.agents,
		personal: personal.agents,
		detected,
		all: input.all,
		installedDir: (agent) => installed.get(agent.id),
		answered,
	});
	const offered = new Set(
		agents.filter((agent) => agent.origin === 'detected').map((a) => a.id),
	);
	return {
		detected,
		agents,
		candidates: detected.filter(
			(each) =>
				each.foundIn === 'path-candidate' && offered.has(each.name),
		),
	};
};

/** How a declined candidate is kept among the person's declined offers. */
const CANDIDATE_OFFER_PREFIX = 'agent-candidate:';

/** The candidate names the person declined. */
const answeredCandidates = (
	declined: readonly string[] | undefined,
): ReadonlySet<string> =>
	new Set(
		(declined ?? [])
			.filter((offer) => offer.startsWith(CANDIDATE_OFFER_PREFIX))
			.map((offer) => offer.slice(CANDIDATE_OFFER_PREFIX.length)),
	);

/**
 * Keep the person's answer about an executable offered as an agent, so it
 * is never asked again: yes declares it (a CLI agent started by its name),
 * no records the refusal in their file.
 */
export const answerAgentCandidate = async (input: {
	readonly workspace: string;
	readonly name: string;
	readonly accept: boolean;
	readonly personalRoot?: string | undefined;
}): Promise<{ readonly personalLayer: string; readonly kept: boolean }> => {
	if (input.accept) {
		const declared = await declareAgent({
			workspace: input.workspace,
			agent: { id: input.name, kind: 'cli', command: input.name },
			personalRoot: input.personalRoot,
		});
		return { personalLayer: declared.personalLayer, kept: declared.added };
	}
	const { personalPath } = await layersOf(
		input.workspace,
		input.personalRoot,
	);
	const merged = await addToPersonalLayer(personalPath, {
		declinedOffers: [`${CANDIDATE_OFFER_PREFIX}${input.name}`],
	});
	return { personalLayer: personalPath, kept: merged.declinedOffers > 0 };
};

/** Declare an agent in the person's file for this project; refused, unwritten, when invalid. */
export const declareAgent = async (input: {
	readonly workspace: string;
	readonly agent: unknown;
	readonly personalRoot?: string | undefined;
}): Promise<{
	readonly personalLayer: string;
	readonly added: boolean;
	readonly agent: IDeclaredAgent;
}> => {
	const parsed = DECLARED_AGENT_SCHEMA.safeParse(input.agent);
	if (!parsed.success)
		throw new Error(
			parsed.error.issues
				.map(
					(issue) =>
						`${issue.path.join('.') || 'agent'}: ${issue.message}`,
				)
				.join('; '),
		);
	const { personalPath } = await layersOf(
		input.workspace,
		input.personalRoot,
	);
	const merged = await addToPersonalLayer(personalPath, {
		agents: [parsed.data],
	});
	return {
		personalLayer: personalPath,
		added: merged.agents > 0,
		agent: parsed.data,
	};
};

/** Install a registry agent's binary for this platform, verified by its sha256. */
export const installAgent = async (input: {
	readonly id: string;
	readonly registry?: IAgentRegistry | undefined;
	readonly download?: ((url: string) => Promise<Uint8Array>) | undefined;
	readonly root?: string | undefined;
}): Promise<{
	readonly id: string;
	readonly dir?: string | undefined;
	readonly note: string;
}> => {
	const registry = input.registry ?? (await readAgentRegistry());
	const agent = registry?.agents.find((each) => each.id === input.id);
	if (agent === undefined)
		throw new Error(`no agent ${input.id} in the registry`);
	if (
		agent.distribution.npx !== undefined ||
		agent.distribution.uvx !== undefined
	)
		return {
			id: agent.id,
			note: `${agent.id} runs as a package (${agent.distribution.npx !== undefined ? 'npx' : 'uvx'}); it is fetched on first use, nothing to install`,
		};
	const { dir } = await installAgentBinary(agent, {
		download: input.download,
		root: input.root,
	});
	return {
		id: agent.id,
		dir,
		note: `installed ${agent.name} ${agent.version} in ${dir}`,
	};
};
