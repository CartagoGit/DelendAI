import { redactSecrets } from '@delendai/core/public';

import { EMPTY_ROADMAP } from '../contracts/constants/roadmap-store.constant';
import type {
	IMarkdownRoadmapStoreOptions,
	IRoadmapFileParts,
	IRoadmapMutation,
	IRoadmapStore,
} from '../contracts/interfaces/roadmap-store.interface';
import type {
	IRoadmap,
	IRoadmapResult,
} from '../contracts/interfaces/roadmap.interface';
import { readRoadmap } from '../validation/roadmap-reader.service';
import { joinRoadmapFile, splitRoadmapFile } from './roadmap-file-codec.helper';

interface ILoadedRoadmap {
	readonly roadmap: IRoadmap;
	readonly after: string;
}

/**
 * The roadmap authority kept in a git-tracked file. The file path and the
 * file operations both come from the caller; nothing here knows where the
 * project keeps its roadmap or how the bytes reach the disk.
 */
export class MarkdownRoadmapStore implements IRoadmapStore {
	constructor(private readonly options: IMarkdownRoadmapStoreOptions) {}

	async read(): Promise<IRoadmapResult<IRoadmap>> {
		const loaded = await this.load();
		return loaded.ok ? { ok: true, value: loaded.value.roadmap } : loaded;
	}

	/**
	 * Reads, changes and writes under one lock, so two writers cannot lose
	 * each other's change. A file that cannot be parsed is moved aside
	 * before anything is written, because treating it as empty would
	 * overwrite the only copy of what it said.
	 */
	update(mutation: IRoadmapMutation): Promise<IRoadmapResult<IRoadmap>> {
		const { path, files } = this.options;
		return files.withLock(path, async () => {
			const text = await files.read(path);
			const split =
				text === undefined ? undefined : splitRoadmapFile(path, text);
			if (split !== undefined && !split.ok) {
				return this.quarantined(split.reason);
			}
			const loaded = this.validate(split?.value);
			if (!loaded.ok) return loaded;
			const changed = mutation(loaded.value.roadmap);
			if (!changed.ok) return changed;
			const checked = readRoadmap(changed.value);
			if (!checked.ok) return checked;
			const document = joinRoadmapFile(
				path,
				checked.value,
				loaded.value.after,
			);
			await files.write(path, redactSecrets(document).text);
			return checked;
		});
	}

	private async load(): Promise<IRoadmapResult<ILoadedRoadmap>> {
		const { path, files } = this.options;
		const text = await files.read(path);
		if (text === undefined) return this.validate(undefined);
		const split = splitRoadmapFile(path, text);
		return split.ok ? this.validate(split.value) : split;
	}

	private validate(
		parts: IRoadmapFileParts | undefined,
	): IRoadmapResult<ILoadedRoadmap> {
		if (parts === undefined) {
			return { ok: true, value: { roadmap: EMPTY_ROADMAP, after: '' } };
		}
		const roadmap = readRoadmap(parts.data);
		return roadmap.ok
			? {
					ok: true,
					value: { roadmap: roadmap.value, after: parts.after },
				}
			: roadmap;
	}

	private async quarantined(
		reason: string,
	): Promise<IRoadmapResult<IRoadmap>> {
		const backup = await this.options.files.quarantine(this.options.path);
		return {
			ok: false,
			reason:
				backup === null
					? `${reason}; the file could not be moved aside, so nothing was written`
					: `${reason}; the unreadable file was moved to ${backup}`,
		};
	}
}
