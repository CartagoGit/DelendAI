/**
 * agent-signature.helper.ts — every agent file delendai writes ends with a
 * marker holding the hash of what it wrote, so a later pass can tell a
 * file as delendai left it from one a person edited: only the first is
 * ever rewritten or removed.
 */
import { createHash } from 'node:crypto';

import type {
	IAgentSignature,
	IAgentSignatureKind,
} from '../contracts/interfaces/agent-signature.interface';

const MARKER =
	/\n<!-- delendai:(plugin-agent|catalog-agent)(?: plugin=(\S+))? sha=([0-9a-f]+) -->\n?$/u;

const hash = (text: string): string =>
	createHash('sha256').update(text).digest('hex').slice(0, 16);

/** `content` with its marker; `plugin` names the plugin of a plugin agent. */
export const signAgent = (
	content: string,
	kind: IAgentSignatureKind,
	plugin?: string,
): string =>
	`${content}\n<!-- delendai:${kind}${plugin === undefined ? '' : ` plugin=${plugin}`} sha=${hash(content)} -->\n`;

/** The marker of `text`, and whether the file is as delendai wrote it. */
export const readAgentSignature = (
	text: string,
): IAgentSignature | undefined => {
	const match = MARKER.exec(text);
	if (match === null) return undefined;
	return {
		kind: match[1] as IAgentSignatureKind,
		plugin: match[2] ?? '',
		untouched: hash(text.slice(0, match.index)) === match[3],
	};
};
