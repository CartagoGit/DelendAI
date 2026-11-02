/**
 * docker-signals.service.ts — whether the repository uses Docker.
 *
 * The tools that change images, containers, networks and volumes are
 * registered only where a root `Dockerfile`, compose file or
 * `.devcontainer/` says the project uses Docker. Elsewhere the plugin
 * stays passive: it inspects and lints, and changes nothing.
 */
import { SafeWorkspaceReader } from '@delendai/core/public';

import { DOCKER_SIGNALS } from '../contracts/constants/docker-signals.constant';

/** The Docker signals at the workspace root, in the order they are named. */
export const dockerSignals = async (
	workspaceRoot: string,
): Promise<readonly string[]> => {
	const listed = await new SafeWorkspaceReader(workspaceRoot)
		.list('.')
		.catch(() => undefined);
	const names = new Set(
		(listed?.entries ?? []).map((entry) => entry.path.relativePath),
	);
	return DOCKER_SIGNALS.filter((signal) => names.has(signal));
};
