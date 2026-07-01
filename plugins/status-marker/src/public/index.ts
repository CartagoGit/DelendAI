/**
 * Public surface of `@mcp-vertex/status-marker`.
 *
 * Re-exports the canonical table + helpers so other plugins and the
 * web site can render, validate or produce close markers without
 * importing the plugin's `src/index.ts` (which has side effects
 * through `definePlugin`).
 */

export {
	CLOSE_MARKER_STATES,
	CLOSE_SEPARATOR,
	EMOJI_TO_STATE,
	formatCloseMarker,
	formatLxAppCloseMarker,
	MAX_LINE_LEN,
	MARKERS,
	REASON_MISSING_TOKEN,
} from '../lib/markers';
export type { CloseMarker, IMarkerDef } from '../lib/markers';

export {
	splitLastLine,
	validateCloseMarker,
	validateResponseClose,
} from '../lib/validate';
export type { IValidationResult, Violation } from '../lib/validate';

export { default } from '../index';

// --- generated tool-output types (N23, see scripts/generate-tool-types.ts) ---
export type * from '../generated/tool-outputs';
