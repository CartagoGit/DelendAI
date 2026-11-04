/**
 * f00125 S2 — Interaction driver interface.
 *
 * Extends the S1 inspection surface (navigate/screenshot/query) with the
 * primitives an E2E test needs: click an element, fill an input,
 * evaluate an assertion, run axe for accessibility. The driver is
 * injected by the host (production: a real Playwright page wrapper;
 * tests: a mock that returns canned results). The plugin NEVER spawns
 * Playwright implicitly — same opt-in model as S1.
 *
 * The driver is the only place we touch Playwright. Tool logic is a
 * pure planner over this interface, so every tool is unit-testable
 * without a real browser.
 */
import type { IBrowserDriver } from '../page/ibrowser-driver';

/** Where on the page to interact. CSS selector or `text=<exact>`. */
export type ITarget = string;

/** Result of an interaction primitive. */
export interface IInteractionResult {
	/** The selector that was acted on, after any normalization. */
	readonly target: ITarget;
	/** The action that ran (e.g. `click`, `fill`). */
	readonly action: 'click' | 'fill';
	/** URL after the interaction (may have changed for `click` on a link). */
	readonly url: string;
	/** Number of elements matched by `target` (1 expected). */
	readonly matched: number;
}

/** Selector + value for `fill`. */
export interface IFillRequest {
	readonly url: string;
	readonly target: ITarget;
	readonly value: string;
	/** Submits the form after fill (Enter key). */
	readonly submit?: boolean;
}

/** What an assertion checks. */
export type IAssertionKind =
	| 'text-equals'
	| 'text-contains'
	| 'visible'
	| 'hidden'
	| 'count'
	| 'url-matches'
	| 'title-matches';

export interface IAssertRequest {
	readonly url: string;
	readonly kind: IAssertionKind;
	/** For `text-equals` / `text-contains`: target selector to read from. */
	readonly target?: ITarget;
	/** Expected literal value (text, count, regex source, etc.). */
	readonly expected: string;
	/** Count assertion: minimum occurrences. Defaults to 1 for `visible`. */
	readonly count?: number;
	/** Treat `expected` as a regex source. */
	readonly regex?: boolean;
	/** Free-form label for the assertion (used in finding messages). */
	readonly label?: string;
}

/** Outcome of running an assertion against the live page. */
export interface IAssertOutcome {
	readonly url: string;
	readonly kind: IAssertionKind;
	readonly passed: boolean;
	readonly observed: string;
	readonly expected: string;
	readonly label?: string;
}

/** Raw axe-core result shape we normalize. Kept minimal to avoid bundling axe types. */
export interface IAxeNode {
	readonly html?: string;
	readonly target?: readonly string[];
	readonly failureSummary?: string;
}

export interface IAxeViolation {
	readonly id: string;
	readonly impact?: 'minor' | 'moderate' | 'serious' | 'critical' | null;
	readonly description?: string;
	readonly help?: string;
	readonly helpUrl?: string;
	readonly nodes: readonly IAxeNode[];
}

export interface IAxeRunResult {
	readonly url: string;
	readonly violations: readonly IAxeViolation[];
	readonly passes: number;
	readonly incomplete: number;
}

/** A11y driver primitive — runs axe-core against `url`. */
export interface IA11yRequest {
	readonly url: string;
	/** Optional axe tag filter (e.g. `wcag2a`, `wcag21aa`). */
	readonly tags?: readonly string[];
}

export interface IBrowserActionDriver {
	/** Click an element matching `target` on `url`. */
	readonly click: (req: {
		url: string;
		target: ITarget;
	}) => Promise<IInteractionResult>;
	/** Fill `value` into the input/textarea matched by `target`. */
	readonly fill: (req: IFillRequest) => Promise<IInteractionResult>;
	/** Evaluate an assertion against `url`. */
	readonly assert: (req: IAssertRequest) => Promise<IAssertOutcome>;
	/** Run axe-core against `url`, returning the raw report. */
	readonly runAxe: (req: IA11yRequest) => Promise<IAxeRunResult>;
}

/**
 * Convenience composite — production drivers satisfy both halves; tests
 * can satisfy either independently.
 */
export type IFullBrowserDriver = Omit<IBrowserDriver, 'assert'> &
	IBrowserActionDriver;
