interface IBlockableStream {
	readonly write: (text: string) => unknown;
	readonly _handle?: { readonly setBlocking?: (blocking: boolean) => void };
}

/**
 * Writes `text` to stdout in one write that is complete when it returns, so
 * the process can set a non-zero exit code right after without the runtime's
 * own exit message landing in the middle of a piped document. A pipe is
 * asynchronous by default; its handle is made blocking first.
 */
export const writeStdoutSync = (
	text: string,
	stream: IBlockableStream = process.stdout as unknown as IBlockableStream,
): void => {
	stream._handle?.setBlocking?.(true);
	stream.write(text);
};
