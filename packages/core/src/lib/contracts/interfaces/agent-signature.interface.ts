/**
 * agent-signature.interface.ts — who wrote an agent file delendai signs.
 */

/** A plugin's contributed role, or delendai's own catalog. */
export type IAgentSignatureKind = 'plugin-agent' | 'catalog-agent';

/** What an agent file's marker says. */
export interface IAgentSignature {
	readonly kind: IAgentSignatureKind;
	/** The plugin of a plugin agent; empty for a catalog agent. */
	readonly plugin: string;
	/** The file is as delendai wrote it. */
	readonly untouched: boolean;
}
