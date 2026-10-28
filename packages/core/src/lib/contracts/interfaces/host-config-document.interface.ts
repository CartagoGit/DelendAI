/**
 * host-config-document.interface.ts — a host config, and the text it was
 * read from.
 *
 * The text is kept because a JSONC document is edited in place: the
 * rewritten value is not what the file becomes — the file becomes the
 * original with the rewritten members applied to it.
 */
export interface IHostConfigDocument {
	readonly text: string;
	readonly value: Record<string, unknown>;
	/**
	 * Whether plain JSON could parse it. A plain JSON file is rewritten
	 * exactly as it always was; only a file that needs the lenient reader
	 * is edited in place.
	 */
	readonly plain: boolean;
}
