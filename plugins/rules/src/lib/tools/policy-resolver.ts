import type { ICommandSet } from '../frameworks/contracts';

/**
 * Dependency Inversion: the seam S11 of f00051 will implement
 * for real. The interface declares the *contract* today so the
 * 3 tools (`get_rules`, `check_rules`, `apply_rules`) can be
 * written against the abstraction without waiting for the
 * implementation. A test or a future slice can drop in a real
 * `IPolicyResolver` without touching the tools.
 *
 * Single Responsibility: the priority order (`project >
 * dogma > default`) is **encoded once**, in the implementation
 * of this interface. The tools never branch on the priority
 * themselves; they call `resolveCommand(area)` and read the
 * result.
 */
export type PolicyLayer = 'project' | 'dogma' | 'default';

export interface IResolvedCommand {
	/** Which layer the *effective* command came from. */
	readonly effective: PolicyLayer;
	/** The command the agent should run. */
	readonly command: string;
	/**
	 * Human-readable explanation of *why* this command was chosen
	 * and *why* the lower layers were ignored. Surfaced in
	 * `check_rules.evidence` and `apply_rules.steps` so the
	 * agent can render the decision to the user.
	 */
	readonly rationale: string;
	/** The check / fix / typecheck triples per layer (for the
	 *  `evidence` field of `check_rules`). */
	readonly fromProject?: ICommandSet;
	readonly fromDogma?: ICommandSet;
	readonly fromDefault: ICommandSet;
}

/**
 * One area + its full resolution. Interface Segregation: the
 * resolver depends on the narrow shape it needs (the three
 * command sets, one per layer), not on the full `IAreaRules`
 * domain shape.
 */
export interface IPolicyResolutionInput {
	readonly areaDir: string;
	readonly fromProject?: ICommandSet;
	readonly fromDogma?: ICommandSet;
	readonly fromDefault: ICommandSet;
}

export interface IPolicyResolver {
	resolveCommand(input: IPolicyResolutionInput): IResolvedCommand;
}

/**
 * The default policy: project config wins, then dogma, then the
 * plugin's vendored default. Encodes the f00051 priority order
 * in one place. Today's tools will use this implementation; a
 * future slice can swap it (e.g. a "treat dogma as advisory"
 * policy for projects that opt in via
 * `mcp-vertex.config.json#plugins.rules.policy`).
 */
export const PROJECT_OVER_DOGMA_OVER_DEFAULT: IPolicyResolver = {
	resolveCommand({ fromProject, fromDogma, fromDefault }): IResolvedCommand {
		if (fromProject !== undefined) {
			return {
				effective: 'project',
				command: fromProject.checkCommand,
				rationale:
					'Project ships its own linter config; project wins (priority: project > dogma > default). The dogma is your guide for NEW code, not for running the existing toolchain.',
				fromProject,
				fromDefault,
				...(fromDogma !== undefined ? { fromDogma } : {}),
			};
		}
		if (fromDogma !== undefined) {
			return {
				effective: 'dogma',
				command: fromDogma.checkCommand,
				rationale:
					'No project config; falling back to the language dogma. The dogma is opinionated and aligned with the most-mainstream community conventions for this language.',
				fromDogma,
				fromDefault,
			};
		}
		return {
			effective: 'default',
			command: fromDefault.checkCommand,
			rationale:
				'No project config, no dogma match; running the plugin vendored default.',
			fromDefault,
		};
	},
};
