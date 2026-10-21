/**
 * public-catalogues.constant.ts — the public catalogues read by default,
 * and how often a source is asked whether it changed.
 *
 * Both are public files: fetching one sends nothing about the person.
 * The Agent Client Protocol registry lists coding agents and how each is
 * launched; models.dev lists providers, their key variables, API URLs and
 * models. A project or a person can list other sources first
 * (`catalogues` in delendai.config.json); these stay the defaults.
 */
import type { IPublicCatalogueKind } from '../interfaces/public-catalogue.interface';

export const DEFAULT_CATALOGUE_SOURCES: Readonly<
	Record<IPublicCatalogueKind, readonly string[]>
> = {
	agents: [
		'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json',
	],
	models: ['https://models.dev/api.json'],
};

/** Within this, a cached copy is served without asking the source again. */
export const CATALOGUE_RECHECK_MS = 10 * 60 * 1000;

export const CATALOGUE_FETCH_TIMEOUT_MS = 8000;

/** The folder of the user cache holding one copy per catalogue. */
export const CATALOGUE_CACHE_FOLDER = 'catalogues';

/** Where f00782 cached the model catalogue before the layers existed. */
export const LEGACY_MODEL_CATALOGUE_FILE = 'model-catalogue.json';

/** The compact model catalogue's shape; raise it when `compactCatalogue` keeps more. */
export const MODEL_CATALOGUE_FORMAT = 2;

/** The compact agent registry's shape; raise it when `compactAgentRegistry` keeps more. */
export const AGENT_REGISTRY_FORMAT = 1;
