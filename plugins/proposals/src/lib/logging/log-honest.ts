import { basename, dirname, isAbsolute } from 'node:path';

import { SafeWorkspaceReader, writeFileAtomic } from '@delendai/core/public';

export interface IRawLogEntry {
	readonly ts: string;
	readonly tool: string;
	readonly outcome?: 'ok' | 'idle' | 'error';
	readonly meta?: {
		readonly isError?: boolean;
		readonly [k: string]: unknown;
	};
	readonly [k: string]: unknown;
}

export interface IHonestLogEntry extends IRawLogEntry {
	/** Always 'error' when meta.isError === true; otherwise the LLM's reported outcome (default 'idle'). */
	readonly outcome: 'ok' | 'idle' | 'error';
}

const toOutcome = (entry: IRawLogEntry): 'ok' | 'idle' | 'error' => {
	if (entry.meta?.isError === true) return 'error';
	return entry.outcome ?? 'idle';
};

export const honestEntry = (entry: IRawLogEntry): IHonestLogEntry => ({
	...entry,
	outcome: toOutcome(entry),
});

const resolveSource = async (
	source: string,
): Promise<{
	readonly content: string;
	readonly sourcePath?: string;
}> => {
	if (!isAbsolute(source)) {
		return { content: source };
	}
	try {
		return {
			content: (
				await new SafeWorkspaceReader(dirname(source)).readText(
					basename(source),
				)
			).content,
			sourcePath: source,
		};
	} catch (error: unknown) {
		if (
			error &&
			typeof error === 'object' &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return { content: source };
		}
		throw error;
	}
};

export const honestRewriteFile = async (input: {
	source: string;
	dest?: string;
}): Promise<{ processed: number; rewritten: number }> => {
	const resolved = await resolveSource(input.source);
	const dest = input.dest ?? resolved.sourcePath;
	if (dest === undefined) {
		throw new Error(
			'dest is required when source is raw JSONL content, not a file path',
		);
	}

	const lines = resolved.content.split(/\r?\n/);
	const output: string[] = [];
	let processed = 0;
	let rewritten = 0;

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		try {
			const parsed = JSON.parse(trimmed) as IRawLogEntry;
			const honest = honestEntry(parsed);
			processed += 1;
			if (honest.outcome !== parsed.outcome) rewritten += 1;
			output.push(JSON.stringify(honest));
		} catch {}
	}

	const next = output.length === 0 ? '' : `${output.join('\n')}\n`;
	await writeFileAtomic(dest, next);
	return { processed, rewritten };
};
