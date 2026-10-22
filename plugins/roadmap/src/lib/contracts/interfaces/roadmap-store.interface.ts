import type { IRoadmap, IRoadmapResult } from './roadmap.interface';

/**
 * The file operations the store needs, handed in so the store itself
 * touches no file system and a test can run it against a fake.
 */
export interface IRoadmapFilePort {
	/** The file's text, or `undefined` when it does not exist. */
	readonly read: (path: string) => Promise<string | undefined>;
	/** Replaces the file whole or not at all. */
	readonly write: (path: string, content: string) => Promise<void>;
	/** Moves an unreadable file aside and returns where, or `null` if it could not. */
	readonly quarantine: (path: string) => Promise<string | null>;
	/** Runs `fn` while no other writer holds the same file. */
	readonly withLock: <T>(path: string, fn: () => Promise<T>) => Promise<T>;
}

/** A change to apply to the roadmap; it returns the new roadmap or why not. */
export type IRoadmapMutation = (roadmap: IRoadmap) => IRoadmapResult<IRoadmap>;

/** The authority file: read it, or change it under one lock. */
export interface IRoadmapStore {
	readonly read: () => Promise<IRoadmapResult<IRoadmap>>;
	readonly update: (
		mutation: IRoadmapMutation,
	) => Promise<IRoadmapResult<IRoadmap>>;
}

export interface IMarkdownRoadmapStoreOptions {
	/** Absolute path of the roadmap file, supplied by the caller. */
	readonly path: string;
	readonly files: IRoadmapFilePort;
}

/** A roadmap file split into the data it carries and the prose around it. */
export interface IRoadmapFileParts {
	readonly data: unknown;
	/** Text before and after the data block, kept as written. */
	readonly before: string;
	readonly after: string;
}
