/**
 * change-request-forges.service.ts — the forges that can rewrite a change
 * request's text, found by name (x01023).
 *
 * The core defines what it asks of a forge (`IChangeRequestForge`) and
 * does not import one: each forge plugin exposes its adapter on its plugin
 * object, and this loads the first-party forge plugins the way the host
 * loads any plugin. A plugin that is not installed is skipped, so a
 * project on one forge never needs the other.
 */
import type {
	IChangeRequestForge,
	IChangeRequestRunner,
} from '../contracts/interfaces/change-request-forge.interface';
import type { IPullRequestPorts } from '../contracts/interfaces/publication-pull-request.interface';
import { forgeCli, readGit } from './work-unit-shared.service';
import { nodeDynamicImport } from '../plugins/load-plugins';

/** The first-party plugins that host change requests. */
const FORGE_PLUGINS: readonly string[] = [
	'@delendai/github',
	'@delendai/gitlab',
];

export const loadChangeRequestForges = async (
	workspaceRoot: string,
	load: (
		specifier: string,
		workspaceRoot?: string,
	) => Promise<unknown> = nodeDynamicImport,
): Promise<readonly IChangeRequestForge[]> => {
	const forges: IChangeRequestForge[] = [];
	for (const specifier of FORGE_PLUGINS) {
		try {
			const loaded = (await load(specifier, workspaceRoot)) as {
				readonly default?: {
					readonly changeRequestForge?: IChangeRequestForge;
				};
			};
			const forge = loaded.default?.changeRequestForge;
			if (forge !== undefined) forges.push(forge);
		} catch {
			// Not installed here: the project does not use that forge.
		}
	}
	return forges;
};

/** A forge CLI's output as the adapters read it: text, or parsed JSON. */
const runnerOver = (
	cli: (bin: string, args: readonly string[]) => string | undefined,
): IChangeRequestRunner => ({
	text: cli,
	json: (bin, args) => {
		const raw = cli(bin, args);
		if (raw === undefined || raw === '') return undefined;
		try {
			return JSON.parse(raw) as unknown;
		} catch {
			return undefined;
		}
	},
});

/** What the pull-request step asks of git and of the forges (x01023). */
export const pullRequestPorts = async (
	root: string,
	load?: Parameters<typeof loadChangeRequestForges>[1],
): Promise<IPullRequestPorts> => {
	const cli = (bin: string, args: readonly string[]) =>
		forgeCli(root, args, bin);
	return {
		git: (args) => readGit(root, args),
		gh: (args) => cli('gh', args),
		run: runnerOver(cli),
		forges: await loadChangeRequestForges(root, load),
	};
};
