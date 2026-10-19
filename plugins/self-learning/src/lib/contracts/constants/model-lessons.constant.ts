/** How far back an accepted outcome counts as recent support for a model lesson. */
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 30;

export const MODEL_LESSON_RECENCY_MS = RECENT_DAYS * DAY_MS;
