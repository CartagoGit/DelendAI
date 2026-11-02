import { redactSecrets } from '@delendai/core/public';

import {
	MARKDOWN_TIMELINE_HEADER,
	MARKDOWN_TIMELINE_LINE_PREFIX,
} from '../contracts/constants/timeline.constant';
import type { IRoadmapResult } from '../contracts/interfaces/roadmap.interface';
import type {
	IMarkdownTimelineStoreOptions,
	IRoadmapTimelineDraft,
	IRoadmapTimelineEvent,
	IRoadmapTimelineFilter,
	IRoadmapTimelineStore,
} from '../contracts/interfaces/timeline.interface';
import { timelineEventSchema } from '../contracts/schemas/timeline.schema';
import { filterTimeline } from '../timeline/timeline-query.helper';
import { sealDrafts } from '../timeline/timeline-seal.helper';

const parseLine = (
	line: string,
	number: number,
): IRoadmapResult<IRoadmapTimelineEvent> => {
	try {
		const parsed = timelineEventSchema.safeParse(
			JSON.parse(line.slice(MARKDOWN_TIMELINE_LINE_PREFIX.length)),
		);
		return parsed.success
			? { ok: true, value: parsed.data }
			: { ok: false, reason: `line ${number} is not a timeline event` };
	} catch {
		return { ok: false, reason: `line ${number} is not valid JSON` };
	}
};

const parseTimeline = (
	text: string,
): IRoadmapResult<readonly IRoadmapTimelineEvent[]> => {
	const events: IRoadmapTimelineEvent[] = [];
	for (const [index, line] of text.split('\n').entries()) {
		if (!line.startsWith(MARKDOWN_TIMELINE_LINE_PREFIX)) continue;
		const event = parseLine(line, index + 1);
		if (!event.ok) return event;
		events.push(event.value);
	}
	return { ok: true, value: events };
};

/**
 * A timeline in a markdown file, one event per line, so anyone can ask
 * "when was this added" with a text search and CI can audit it without a
 * database. The only write is to add lines at the end under the file
 * lock: what was there before is carried over byte for byte.
 */
export class MarkdownTimelineStore implements IRoadmapTimelineStore {
	constructor(private readonly options: IMarkdownTimelineStoreOptions) {}

	append(
		drafts: readonly IRoadmapTimelineDraft[],
	): Promise<IRoadmapResult<readonly IRoadmapTimelineEvent[]>> {
		const { path, files } = this.options;
		return files.withLock(path, async () => {
			const existing =
				(await files.read(path)) ?? MARKDOWN_TIMELINE_HEADER;
			const history = parseTimeline(existing);
			if (!history.ok) return this.unreadable(history.reason);
			const sealed = sealDrafts(history.value.at(-1)?.seq ?? 0, drafts);
			if (!sealed.ok || sealed.value.length === 0) return sealed;
			const lines = sealed.value.map(
				(event) =>
					`${MARKDOWN_TIMELINE_LINE_PREFIX}${redactSecrets(JSON.stringify(event)).text}\n`,
			);
			const separator = existing.endsWith('\n') ? '' : '\n';
			await files.write(path, `${existing}${separator}${lines.join('')}`);
			return sealed;
		});
	}

	async list(
		filter?: IRoadmapTimelineFilter,
	): Promise<IRoadmapResult<readonly IRoadmapTimelineEvent[]>> {
		const { path, files } = this.options;
		const text = await files.read(path);
		if (text === undefined) return { ok: true, value: [] };
		const history = parseTimeline(text);
		return history.ok
			? { ok: true, value: filterTimeline(history.value, filter) }
			: history;
	}

	/** An unreadable history is set aside, never appended to or replaced. */
	private async unreadable(
		reason: string,
	): Promise<IRoadmapResult<readonly IRoadmapTimelineEvent[]>> {
		const backup = await this.options.files.quarantine(this.options.path);
		return {
			ok: false,
			reason:
				backup === null
					? `timeline is unreadable (${reason}) and could not be moved aside`
					: `timeline is unreadable (${reason}); it was moved to ${backup}`,
		};
	}
}
