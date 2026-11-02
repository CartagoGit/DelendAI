import type { IRoadmap } from '../interfaces/roadmap.interface';
import { ROADMAP_SCHEMA_VERSION } from './roadmap.constant';

/** What a project that has not written a roadmap yet reads as. */
export const EMPTY_ROADMAP: IRoadmap = {
	schemaVersion: ROADMAP_SCHEMA_VERSION,
	horizons: [],
};

/** Fence of the data block at the top of a markdown roadmap. */
export const FRONT_MATTER_FENCE = '---';

/** Extensions whose files carry the data inside front matter. */
export const MARKDOWN_EXTENSIONS: readonly string[] = ['.md', '.markdown'];
