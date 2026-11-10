/**
 * Code form of `docs/delendai/host-compatibility-matrix.md` (AUD-C01 /
 * x00285). Every row of that table that names a specific host is
 * reproduced here so a host this repo has already verified keeps exactly
 * the mode the matrix documents, independent of whatever capabilities it
 * declares (or omits) — the capability-based fallback in `decide-mode.ts`
 * only ever runs for a `clientInfo.name` that matches none of these.
 *
 * Keep this array and the matrix in sync by hand: there is no generator.
 * If the matrix gains or changes a row, this file changes with it.
 */
import type { IHostModeProfile } from '../contracts/interfaces/host-mode-profile.interface';

const nameIncludes =
	(...needles: readonly string[]) =>
	(clientName: string): boolean => {
		const lower = clientName.toLowerCase();
		return needles.some((needle) => lower.includes(needle));
	};

export const HOST_MODE_PROFILES: readonly IHostModeProfile[] = [
	{
		match: nameIncludes('claude-code', 'claude code'),
		mode: 'managed',
		rationale:
			'host-compatibility-matrix.md: Claude Code -> managed (vertex router bridges tool discovery)',
	},
	{
		match: nameIncludes('cursor'),
		mode: 'managed',
		rationale: 'host-compatibility-matrix.md: Cursor -> managed',
	},
	{
		match: nameIncludes('copilot', 'vscode', 'visual studio code'),
		mode: 'managed',
		rationale:
			'host-compatibility-matrix.md: VS Code Copilot Chat -> managed',
	},
	{
		match: nameIncludes('aider'),
		mode: 'managed',
		rationale: 'host-compatibility-matrix.md: Aider -> managed',
	},
	{
		match: nameIncludes('codex'),
		mode: 'managed',
		rationale: 'host-compatibility-matrix.md: Codex -> managed',
	},
	{
		match: nameIncludes('mcp-inspector', 'inspector'),
		mode: 'managed',
		rationale: 'host-compatibility-matrix.md: MCP Inspector -> managed',
	},
	{
		match: nameIncludes('delendai', 'vertex-aware'),
		mode: 'managed',
		rationale:
			'host-compatibility-matrix.md: vertex-aware client -> managed',
	},
];

export const matchHostModeProfile = (
	clientName: string | undefined,
): IHostModeProfile | undefined => {
	if (clientName === undefined || clientName.trim().length === 0) {
		return undefined;
	}
	return HOST_MODE_PROFILES.find((profile) => profile.match(clientName));
};
