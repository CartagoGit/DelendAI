/**
 * install-suggestions.ts — f00418 S2.
 *
 * Maps a missing tool to the install command the user should run on the
 * detected package manager. The service NEVER executes anything — every
 * suggestion carries `confirmed: false` and the `manager: 'none'`
 * sentinel covers environments the service could not classify.
 *
 * Architecture (SRP):
 *   - {@link InstallSuggestionsService}: receives an injectable `run`
 *     seam that probes `command -v` for each candidate package manager.
 *     The first one that resolves wins; if none do, the service returns
 *     `manager: 'none'`.
 *   - {@link IInstallSuggestion}: the contract consumed by the
 *     `shell_status` tool (S3) and by `ToolAvailabilityService`.
 *
 * Non-goals: this service does not download, fetch, or evaluate any
 * command. It only produces text. The user runs it.
 */

export interface IShellRunnerResult {
	readonly code: number;
	readonly output: string;
}

export type PackageManager =
	| 'apt'
	| 'brew'
	| 'bun'
	| 'npm'
	| 'go'
	| 'cargo'
	| 'none';

export interface IInstallSuggestion {
	readonly manager: PackageManager;
	readonly command: string;
	readonly confirmed: false;
	readonly reason?: string;
}

export interface IInstallEntry {
	readonly name: string;
	readonly purpose: string;
	readonly versionArgs: readonly string[];
	readonly alternatives: readonly string[];
}

export interface IInstallSuggestInput {
	readonly entry: IInstallEntry;
	readonly alternativesAvailable: readonly string[];
}

export interface IInstallSuggestionsOptions {
	readonly workspaceRoot: string;
	readonly run: (
		command: string,
		args: readonly string[],
	) => Promise<IShellRunnerResult>;
}

export const PACKAGE_MANAGER_PREFERENCE: readonly PackageManager[] =
	Object.freeze(['apt', 'brew', 'bun', 'npm', 'go', 'cargo']);

/** Builds the package-manager install command for a given tool. */
const buildInstallCommand = (
	manager: Exclude<PackageManager, 'none'>,
	tool: string,
): string => {
	switch (manager) {
		case 'apt':
			return `sudo apt install ${tool}`;
		case 'brew':
			return `brew install ${tool}`;
		case 'bun':
			return `bun add -g ${tool}`;
		case 'npm':
			return `npm install -g ${tool}`;
		case 'go':
			return `go install ${tool}@latest`;
		case 'cargo':
			return `cargo install ${tool}`;
	}
};

const MANAGER_BY_BASENAME: ReadonlyMap<string, PackageManager> = new Map(
	[
		['apt', 'apt'],
		['brew', 'brew'],
		['bun', 'bun'],
		['npm', 'npm'],
		['go', 'go'],
		['cargo', 'cargo'],
	],
);

export class InstallSuggestionsService {
	readonly #workspaceRoot: string;
	readonly #run: IInstallSuggestionsOptions['run'];
	#cachedManager: PackageManager | null = null;

	constructor(options: IInstallSuggestionsOptions) {
		this.#workspaceRoot = options.workspaceRoot;
		this.#run = options.run;
	}

	/**
	 * Detects the active package manager from the basename returned by a
	 * single host probe (`command -v apt brew bun npm go cargo`). The
	 * preference order in `PACKAGE_MANAGER_PREFERENCE` determines which
	 * manager wins when more than one is installed. The result is cached
	 * per service instance.
	 */
	async detectManager(): Promise<PackageManager> {
		if (this.#cachedManager !== null) {
			return this.#cachedManager;
		}
		const result = await this.#run('command', [
			'-v',
			...PACKAGE_MANAGER_PREFERENCE.map((m) => MANAGER_BY_BASENAME.get(m) ?? m),
		]);
		const basename = result.output.trim().split(/\s+/).pop() ?? '';
		if (result.code !== 0 || basename.length === 0) {
			this.#cachedManager = 'none';
			return 'none';
		}
		for (const candidate of PACKAGE_MANAGER_PREFERENCE) {
			if (MANAGER_BY_BASENAME.get(candidate) === basename) {
				this.#cachedManager = candidate;
				return candidate;
			}
		}
		this.#cachedManager = 'none';
		return 'none';
	}

	/**
	 * Produces a textual install command for `input.entry`. If an
	 * alternative tool is already available, returns a `manager: 'none'`
	 * sentinel that carries the rationale, so the caller can show the user
	 * "use python3 instead". Returns `null` only when no manager was
	 * detected AND no alternative is available.
	 */
	async suggest(
		input: IInstallSuggestInput,
	): Promise<IInstallSuggestion | null> {
		const { entry, alternativesAvailable } = input;
		if (alternativesAvailable.length > 0) {
			return {
				manager: 'none',
				command: '',
				confirmed: false,
				reason: `use ${alternativesAvailable[0]} instead of ${entry.name}`,
			};
		}
		const manager = await this.detectManager();
		if (manager === 'none') {
			return null;
		}
		return {
			manager,
			command: buildInstallCommand(manager, entry.name),
			confirmed: false,
		};
	}
}
