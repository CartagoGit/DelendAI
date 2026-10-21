/**
 * model-catalogue.constant.ts — where the public model catalogue is read.
 *
 * models.dev lists the providers of AI models, the variables each one's
 * key is read from, and the models each serves. It is public data: only
 * the file is fetched, nothing about the person is sent.
 */
export const MODEL_CATALOGUE_URL = 'https://models.dev/api.json';

/** A day: the catalogue changes weekly, not by the minute. */
export const MODEL_CATALOGUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const MODEL_CATALOGUE_TIMEOUT_MS = 8000;

export const MODEL_CATALOGUE_FILE = 'model-catalogue.json';
