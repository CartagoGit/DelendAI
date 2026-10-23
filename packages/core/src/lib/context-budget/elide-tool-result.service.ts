/**
 * elide-tool-result.service.ts — an elided tool result stays addressable.
 *
 * A tool result over its byte cap comes back as a stated elision
 * (`truncateIfTooLarge`): the original size, the cap, a structural head.
 * That keeps the caller's context small, but on its own it turns
 * "elided" into "gone" — the rest of the answer was discarded, and a
 * conclusion drawn from the head is drawn from a partial read.
 *
 * So the full output is kept, and the elision says where: when the host
 * has configured a directory, the complete serialised result is written
 * there under its content hash and the envelope carries the path.
 *
 * The write is asynchronous and still finished before anyone can read
 * the path: a tool builds its result synchronously, so the write is only
 * started there, and the handler wrapper every tool result passes
 * through (`instrumentToolHandlers`) awaits it with
 * `settleToolOutputArtifacts` before the result leaves. A write that
 * failed has its path taken back out of the result — an elision without
 * a path is honest, a path to nothing is not. Keeping the output never
 * fails the tool.
 *
 * Process-wide, like the dry-run scope: a tool builds its result long
 * after the host assembled it, with no handle on where the host keeps
 * its cache.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ARTIFACT_PATH_RESERVE_BYTES } from '../contracts/constants/response-byte-budget.constant';
import type {
	ITruncatedEnvelope,
	ITruncationResult,
} from '../contracts/interfaces/truncation.interface';

let artifactDirAbs: string | undefined;
/** Writes started and not yet awaited, by path: whether each succeeded. */
const pending = new Map<string, Promise<boolean>>();

/** Where full outputs are kept; `undefined` stops keeping them. */
export const configureToolOutputArtifacts = (
	dirAbs: string | undefined,
): void => {
	artifactDirAbs = dirAbs;
};

/**
 * Start keeping `serialised` and return the path it will be at, or
 * `undefined` when no directory is configured. Content-addressed, so the
 * same output is kept once however often it is returned.
 */
export const keepFullToolOutput = (serialised: string): string | undefined => {
	const dir = artifactDirAbs;
	if (dir === undefined) return undefined;
	const name = `${createHash('sha256').update(serialised).digest('hex').slice(0, 24)}.json`;
	const path = join(dir, name);
	if (!pending.has(path)) {
		pending.set(
			path,
			mkdir(dir, { recursive: true })
				.then(() => writeFile(path, serialised))
				.then(
					() => true,
					() => false,
				),
		);
	}
	return path;
};

/**
 * `value`, elided to `maxBytes` with the path of its kept full output.
 * The truncation is passed in so this module does not import the one
 * that imports it.
 */
export const elideKeepingOutput = (
	value: unknown,
	maxBytes: number,
	truncate: (value: unknown, maxBytes: number) => ITruncationResult<unknown>,
): unknown => {
	const first = truncate(value, maxBytes);
	if (!first.truncated) return first.value;
	const artifact = keepFullToolOutput(JSON.stringify(value));
	if (artifact === undefined) return first.value;
	const bounded = truncate(
		value,
		Math.max(0, maxBytes - ARTIFACT_PATH_RESERVE_BYTES),
	).value as ITruncatedEnvelope;
	return { ...bounded, artifact };
};

const withoutArtifact = (text: string, failed: ReadonlySet<string>): string => {
	try {
		const parsed = JSON.parse(text) as { artifact?: unknown };
		if (
			typeof parsed.artifact !== 'string' ||
			!failed.has(parsed.artifact)
		) {
			return text;
		}
		const { artifact: _dropped, ...rest } = parsed;
		return JSON.stringify(rest);
	} catch {
		return text;
	}
};

/**
 * Wait for every output this process started keeping, and take the path
 * of any that could not be written back out of `result`.
 */
export const settleToolOutputArtifacts = async <T>(result: T): Promise<T> => {
	if (pending.size === 0) return result;
	const settled = [...pending.entries()];
	pending.clear();
	const failed = new Set<string>();
	for (const [path, written] of settled) {
		if (!(await written)) failed.add(path);
	}
	if (failed.size === 0) return result;
	const shaped = result as {
		content?: { type: string; text?: string }[];
		structuredContent?: { artifact?: unknown };
	};
	if (!Array.isArray(shaped.content)) return result;
	return {
		...shaped,
		content: shaped.content.map((part) =>
			part.type === 'text' && typeof part.text === 'string'
				? { ...part, text: withoutArtifact(part.text, failed) }
				: part,
		),
		...(shaped.structuredContent !== undefined &&
		typeof shaped.structuredContent.artifact === 'string' &&
		failed.has(shaped.structuredContent.artifact)
			? {
					structuredContent: (() => {
						const { artifact: _dropped, ...rest } =
							shaped.structuredContent;
						return rest;
					})(),
				}
			: {}),
	} as T;
};

/**
 * `handler`, returning its result only once the full outputs it named
 * are written — the seam every tool result passes through wraps each
 * handler with this.
 */
export const withSettledOutputArtifacts =
	(handler: unknown) =>
	async (...args: unknown[]): Promise<unknown> =>
		settleToolOutputArtifacts(
			await (handler as (...callArgs: unknown[]) => unknown)(...args),
		);
