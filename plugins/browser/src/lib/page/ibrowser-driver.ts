/**
 * f00125 S1 — Driver interface (pure planner over an injected page).
 *
 * The plugin NEVER spawns Playwright implicitly. A real driver is
 * provided by the host (or by an opt-in `effects: ['network']` install
 * step); the production default is a probe that surfaces an
 * `installHint` when Playwright is missing. Every tool is a pure
 * planner over this interface, so the tool logic is unit-testable
 * without ever launching a real browser.
 */
export type IShotFormat = 'png' | 'jpeg';

export interface INavigateRequest {
	readonly url: string;
	readonly waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
	readonly timeoutMs?: number;
}

export interface INavigateResult {
	readonly url: string;
	readonly title: string;
	readonly status: number;
}

export interface IScreenshotRequest {
	readonly url: string;
	readonly fullPage?: boolean;
	readonly format?: IShotFormat;
}

export interface IScreenshotResult {
	readonly path: string;
	readonly bytes: number;
	readonly format: IShotFormat;
	readonly width: number;
	readonly height: number;
}

export interface IQueryRequest {
	readonly url: string;
	/** CSS selector or `text=<exact>` matcher. */
	readonly selector: string;
	readonly limit?: number;
}

export interface IQueryHit {
	readonly selector: string;
	readonly text: string;
	readonly tag: string;
}

export interface IQueryResult {
	readonly url: string;
	readonly hits: readonly IQueryHit[];
}

export interface IBrowserDriver {
	readonly navigate: (req: INavigateRequest) => Promise<INavigateResult>;
	readonly screenshot: (
		req: IScreenshotRequest,
	) => Promise<IScreenshotResult>;
	readonly query: (req: IQueryRequest) => Promise<IQueryResult>;
}
