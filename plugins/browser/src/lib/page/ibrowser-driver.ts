/**
 * f00125 S1 — injected browser boundary.
 *
 * The plugin never spawns Playwright implicitly. Hosts inject a concrete
 * driver; tests inject a mock. The S1 inspect tools only depend on these
 * narrow contracts.
 */
export type IShotFormat = 'png' | 'jpeg';

export interface IOpenRequest {
	readonly url: string;
	readonly headless?: boolean;
}

export interface IOpenResult {
	readonly url: string;
	readonly title: string;
	readonly html: string;
}

export type INavigateRequest = IOpenRequest;

export type INavigateResult = IOpenResult;

export interface IScreenshotRequest {
	readonly url: string;
	readonly fullPage?: boolean;
	readonly format?: IShotFormat;
}

export interface IScreenshotResult {
	readonly data: Uint8Array;
	readonly format?: IShotFormat;
}

export interface IQueryRequest {
	readonly url: string;
	readonly selector: string;
	readonly limit?: number;
}

export type IQueryHit = string;

export interface IQueryResult {
	readonly url: string;
	readonly matches: readonly IQueryHit[];
}

export interface IAssertRequest {
	readonly url: string;
	readonly selector?: string;
	readonly expected?: string;
	readonly kind: string;
}

export interface IAssertResult {
	readonly passed: boolean;
	readonly observed?: string;
	readonly message?: string;
}

export interface IBrowserDriver {
	readonly open: (req: IOpenRequest) => Promise<IOpenResult>;
	readonly navigate?: (req: INavigateRequest) => Promise<INavigateResult>;
	readonly screenshot: (
		req: IScreenshotRequest,
	) => Promise<IScreenshotResult>;
	readonly query: (req: IQueryRequest) => Promise<IQueryResult>;
	readonly assert: (req: IAssertRequest) => Promise<IAssertResult>;
}
