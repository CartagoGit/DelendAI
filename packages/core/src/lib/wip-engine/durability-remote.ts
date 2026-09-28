/**
 * durability-remote.service.ts — which remote a work ref is published to.
 *
 * One answer for the two paths that publish work refs (the persistence
 * route and the `work_ref` tool), so they cannot disagree about whether a
 * checkpoint is durable.
 *
 * The configured `push.remote` wins. Without one, `origin` is used only
 * when that remote actually exists — the same resolution `push-driver`
 * and `branch-protection-adapter` already apply. This is not guessing
 * from remote ordering: a repository with other remotes and no `origin`
 * still gets no remote, and the caller refuses with a remedy. Demanding
 * an explicit `push.remote` on these two paths alone made every
 * checkpoint fail durability in a repository that has an `origin` and
 * never spelled it out.
 */

export const resolveDurabilityRemote = async (
	run: (args: readonly string[]) => Promise<{ readonly ok: boolean }>,
	configured: string | undefined,
): Promise<string | undefined> => {
	const explicit = configured?.trim();
	if (explicit !== undefined && explicit.length > 0) return explicit;
	return (await run(['remote', 'get-url', 'origin'])).ok
		? 'origin'
		: undefined;
};
