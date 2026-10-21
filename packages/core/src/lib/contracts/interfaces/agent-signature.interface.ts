/**
 * agent-signature.interface.ts — who wrote an agent file delendai signs.
 */

/** A plugin's contributed role, delendai's own catalog, or a plugin's skill. */
export type IAgentSignatureKind =
	| 'plugin-agent'
	| 'catalog-agent'
	| 'plugin-skill';

/** What an agent file's marker says. */
export interface IAgentSignature {
	readonly kind: IAgentSignatureKind;
	/** The plugin of a plugin agent; empty for a catalog agent. */
	readonly plugin: string;
	/** The file is as delendai wrote it. */
	readonly untouched: boolean;
}
