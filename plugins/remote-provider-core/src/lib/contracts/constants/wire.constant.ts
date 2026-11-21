/** Retry, timeout and classification constants shared by every remote-provider HTTP client. */
export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_RETRY_DELAY_MS = 250;
const HTTP_REQUEST_TIMEOUT = 408;
const HTTP_TOO_EARLY = 425;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_BAD_GATEWAY = 502;
const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_GATEWAY_TIMEOUT = 504;

export const retryableStatuses = new Set([
	HTTP_REQUEST_TIMEOUT,
	HTTP_TOO_EARLY,
	HTTP_INTERNAL_SERVER_ERROR,
	HTTP_BAD_GATEWAY,
	HTTP_SERVICE_UNAVAILABLE,
	HTTP_GATEWAY_TIMEOUT,
]);
export const compatibilityHint =
	/(unsupported|deprecated api|unsupported api|preview|incompatible|unknown version)/i;
export const transientHint =
	/(econnreset|econnrefused|eai_again|enotfound|network|socket|fetch failed|temporar)/i;
