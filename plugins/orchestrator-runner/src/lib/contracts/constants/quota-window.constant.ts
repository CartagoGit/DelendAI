/** How long each quota window lasts, and so how far back a budget counts. */
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DAYS_IN_A_WEEK = 7;
const DAYS_IN_A_BUDGET_MONTH = 30;

export const QUOTA_WINDOW_MS = {
	hourly: HOUR_MS,
	weekly: DAYS_IN_A_WEEK * DAY_MS,
	monthly: DAYS_IN_A_BUDGET_MONTH * DAY_MS,
} as const;

/** The status a vendor answers when a window has no room left. */
export const HTTP_TOO_MANY_REQUESTS = 429;
