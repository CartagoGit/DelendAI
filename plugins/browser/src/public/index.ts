/**
 * f00125 — public surface for the browser plugin.
 *
 * The plugin is exposed for plugin-authors / tests; hosts should not
 * import this directly. Stable shape: driver interface + inspect
 * registrations. S3 (verify-page) will be appended here when shipped.
 */
export type {
	IBrowserDriver,
	INavigateRequest,
	INavigateResult,
	IScreenshotRequest,
	IScreenshotResult,
	IQueryRequest,
	IQueryHit,
	IQueryResult,
	IShotFormat,
} from '../lib/page/ibrowser-driver';

export {
	probePlaywright,
	PLAYWRIGHT_INSTALL_HINT,
} from '../lib/page/playwright-probe';

export { buildBrowserInspectToolRegistrations } from '../lib/tools/browser-inspect.tool';
export type { IBrowserInspectToolOptions } from '../lib/tools/browser-inspect.tool';

// S2 (interact + a11y)
export type {
	IAssertOutcome,
	IAssertRequest,
	IA11yRequest,
	IAxeNode,
	IAxeRunResult,
	IAxeViolation,
	IBrowserActionDriver,
	IFillRequest,
	IFullBrowserDriver,
	IInteractionResult,
	IAssertionKind,
	ITarget,
} from '../lib/interact/iaction-driver';
export { buildBrowserA11yToolRegistrations } from '../lib/tools/browser-a11y.tool';
export { mapAxeReport, summarizeSeverity } from '../lib/interact/axe-mapper';
export {
	outcomeToFinding,
	outcomesToFindings,
} from '../lib/interact/assertions';
