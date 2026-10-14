/**
 * Write operator-facing notice lines to stderr, and never fail because
 * of it.
 *
 * Four places had grown their own copy of this loop — plugin load
 * failures, managed-lazy demotion, error-reporting's start-up notice,
 * slice-persistence ownership — because each one independently reached
 * the same two conclusions: the notice is a plain list of lines, and a
 * failure to report a failure must not become a further failure that
 * stops the server. Writing to stderr really can throw (a closed pipe,
 * a host that redirects it), and the whole point of these notices is to
 * appear when something is already going wrong.
 *
 * Keeping the loop in one place also keeps that guarantee in one place:
 * a future caller cannot get the try/catch subtly wrong.
 */
export const announceLines = (
	lines: readonly string[],
	write: (line: string) => void = (line) => {
		process.stderr.write(line);
	},
): void => {
	for (const line of lines) {
		try {
			write(`${line}\n`);
		} catch {
			// Best-effort by construction.
		}
	}
};
