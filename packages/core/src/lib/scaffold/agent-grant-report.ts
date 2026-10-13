/**
 * agent-grant-report.ts — the start-up step that brings the project's
 * agent grants in line with its server and says what it changed.
 */
import { reconcileAgentGrants } from './agent-grant-reconcile.service';

/**
 * Never fails a start: an agent file it cannot rewrite is reported and
 * left as it was.
 */
export const reportAgentGrants = async (
	root: string,
	namespacePrefix: string,
	write: (line: string) => void = (line) => process.stderr.write(line),
): Promise<void> => {
	try {
		const changes = await reconcileAgentGrants({ root, namespacePrefix });
		for (const change of changes)
			write(
				`[delendai] ${change.path} now grants ${change.granted}${change.removed.length > 0 ? ` instead of ${change.removed.join(', ')}` : ''}, the server this project registers.\n`,
			);
	} catch (error) {
		write(
			`[delendai] could not bring the agents' server grants in line: ${error instanceof Error ? error.message : String(error)}\n`,
		);
	}
};
