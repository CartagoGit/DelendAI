const MAX_URL_LENGTH = 2_048;
const MAX_SELECTOR_LENGTH = 512;
const DEFAULT_MAX_RESULTS = 20;
const MAX_RESULTS = 100;

export interface IPlannedPageRequest {
	readonly url: string;
	readonly selector?: string | undefined;
	readonly maxResults?: number | undefined;
}

/** Validate and normalize an HTTP(S) navigation request before it hits a driver. */
export const planPageRequest = (input: {
	readonly url: string;
	readonly selector?: string | undefined;
	readonly maxResults?: number | undefined;
}): IPlannedPageRequest => {
	if (input.url.length === 0 || input.url.length > MAX_URL_LENGTH) {
		throw new Error(
			`url must contain between 1 and ${MAX_URL_LENGTH} characters`,
		);
	}

	let parsed: URL;
	try {
		parsed = new URL(input.url);
	} catch {
		throw new Error('url must be an absolute HTTP(S) URL');
	}
	if (
		(parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
		parsed.username.length > 0 ||
		parsed.password.length > 0
	) {
		throw new Error(
			'url must be an HTTP(S) URL without embedded credentials',
		);
	}

	if (input.selector === undefined) return { url: input.url };
	const selector = input.selector.trim();
	if (selector.length === 0 || selector.length > MAX_SELECTOR_LENGTH) {
		throw new Error(
			`selector must contain between 1 and ${MAX_SELECTOR_LENGTH} characters`,
		);
	}
	const maxResults = input.maxResults ?? DEFAULT_MAX_RESULTS;
	if (
		!Number.isInteger(maxResults) ||
		maxResults < 1 ||
		maxResults > MAX_RESULTS
	) {
		throw new Error(
			`maxResults must be an integer between 1 and ${MAX_RESULTS}`,
		);
	}
	return { url: input.url, selector, maxResults };
};
