import { parse, stringify } from 'yaml';

import {
	FRONT_MATTER_FENCE,
	MARKDOWN_EXTENSIONS,
} from '../contracts/constants/roadmap-store.constant';
import type { IRoadmapFileParts } from '../contracts/interfaces/roadmap-store.interface';
import type {
	IRoadmap,
	IRoadmapResult,
} from '../contracts/interfaces/roadmap.interface';

const isMarkdownPath = (path: string): boolean =>
	MARKDOWN_EXTENSIONS.some((extension) =>
		path.toLowerCase().endsWith(extension),
	);

const parseYaml = (text: string): IRoadmapResult<unknown> => {
	try {
		return { ok: true, value: parse(text) as unknown };
	} catch (error) {
		return {
			ok: false,
			reason: `roadmap data is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
};

/**
 * Splits a roadmap file into its data and the prose around it. A markdown
 * file keeps the data in front matter and the prose after it; any other
 * file is data from top to bottom.
 */
export const splitRoadmapFile = (
	path: string,
	text: string,
): IRoadmapResult<IRoadmapFileParts> => {
	if (!isMarkdownPath(path)) {
		const data = parseYaml(text);
		return data.ok
			? { ok: true, value: { data: data.value, before: '', after: '' } }
			: data;
	}
	const opening = `${FRONT_MATTER_FENCE}\n`;
	const closing = `\n${FRONT_MATTER_FENCE}\n`;
	if (!text.startsWith(opening)) {
		return {
			ok: false,
			reason: `roadmap file must open with a ${FRONT_MATTER_FENCE} front matter block that holds the data`,
		};
	}
	const end = text.indexOf(closing, opening.length - 1);
	if (end === -1) {
		return {
			ok: false,
			reason: `roadmap front matter is never closed with a ${FRONT_MATTER_FENCE} line`,
		};
	}
	const data = parseYaml(text.slice(opening.length, end + 1));
	if (!data.ok) return data;
	return {
		ok: true,
		value: {
			data: data.value,
			before: '',
			after: text.slice(end + closing.length),
		},
	};
};

/** Writes a roadmap back, keeping the prose that came with the file. */
export const joinRoadmapFile = (
	path: string,
	roadmap: IRoadmap,
	after: string,
): string => {
	const data = stringify(roadmap);
	if (!isMarkdownPath(path)) return data;
	return `${FRONT_MATTER_FENCE}\n${data}${FRONT_MATTER_FENCE}\n${after}`;
};
