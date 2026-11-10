/**
 * Who integrates ready work: `land`, the one stateless integrator, or
 * `none`, when the forge or a person merges and delendai integrates nothing.
 */
export const INTEGRATION_ENGINES = ['land', 'none'] as const;
export type IIntegrationEngine = (typeof INTEGRATION_ENGINES)[number];

/** The integration axis's switch: the engine, and the protocol the repository records. */
export interface IPolicyIntegrationEngine {
	/** The actor that integrates ready work; the one switch every reader reads. */
	readonly engine: IIntegrationEngine;
	/**
	 * The integration protocol the repository runs. A process built for an
	 * older one (a host server started before the change) refuses to move
	 * refs or pull requests and says to restart.
	 */
	readonly protocol: number;
	/**
	 * True only when the project lands pull requests with no required
	 * check. Off, an empty `requiredChecks` lands nothing: nothing was proved.
	 */
	readonly landWithoutChecks: boolean;
}
