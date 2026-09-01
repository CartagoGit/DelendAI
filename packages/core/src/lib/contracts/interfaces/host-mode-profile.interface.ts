import type { IMcpToolSurfaceMode } from './surface-mode.interface';

/**
 * A declarative, name-matched default for a known MCP host — the code
 * form of `docs/mcp-vertex/host-compatibility-matrix.md` (AUD-C01 /
 * x00285). `decideSurfaceModeFromCapabilities` walks these before ever
 * falling back to capability detection, so a host this repo has already
 * verified keeps the exact mode the matrix documents regardless of what
 * capabilities it declares (or omits) at handshake time.
 */
export interface IHostModeProfile {
	/** Matches against `clientInfo.name` as reported at MCP handshake. */
	readonly match: (clientName: string) => boolean;
	readonly mode: IMcpToolSurfaceMode;
	/** Human-readable justification, surfaced verbatim in `ISurfaceModeDecision.reason`. */
	readonly rationale: string;
}
