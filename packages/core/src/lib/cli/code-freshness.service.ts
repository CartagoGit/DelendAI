/**
 * code-freshness.service.ts — a server that runs old code says so.
 *
 * A host server lives for days, and the checkout it was started from moves
 * under it: a server started before a fix landed keeps applying the rule
 * the fix replaced (a retirement that should have published did not, five
 * hours after the fix was on develop). The commit of the server's own
 * checkout is read at start and again when asked; when it moved and the
 * move touched the code a server loads, the status says the server is
 * stale and how to restart it. A server not run from a git checkout (an
 * installed package) has nothing to compare and is never called stale.
 */
import type { ICodeFreshness } from '../contracts/interfaces/code-freshness.interface';
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';

/** What a server loads: a move outside these does not make it stale. */
const LOADED_CODE = ['packages', 'plugins'];

const headOf = async (git: IGitRunner): Promise<string | null> => {
	const result = await git(['rev-parse', 'HEAD']);
	return result.ok ? result.output.trim() : null;
};

/**
 * Starts reading the start commit now (without holding the start up); the
 * returned probe compares it with the checkout when asked. `codeDir` is
 * pinned with `git -C`, so a call made on behalf of another checkout still
 * reads the server's own.
 */
export const codeFreshnessProbe = (
	git: IGitRunner,
	codeDir: string,
): (() => Promise<ICodeFreshness>) => {
	const inCode: IGitRunner = (args) => git(['-C', codeDir, ...args]);
	const started = headOf(inCode);
	return async () => {
		const startedAt = await started;
		const now = await headOf(inCode);
		if (startedAt === null || now === null || startedAt === now)
			return { startedAt, now, stale: false };
		const changed = await inCode([
			'diff',
			'--name-only',
			startedAt,
			now,
			'--',
			...LOADED_CODE,
		]);
		const stale = changed.ok && changed.output.trim().length > 0;
		return {
			startedAt,
			now,
			stale,
			...(stale
				? {
						next: 'This server runs code its checkout has since changed; restart the host server (reload the MCP server in the editor) so it applies the current rules.',
					}
				: {}),
		};
	};
};
