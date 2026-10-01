/**
 * existing-proposal.ts — the proposal a retried `create_proposal` already wrote.
 *
 * WHY. `create_proposal` writes the file, then does slow work (index sync,
 * publication). A caller whose request timed out cannot tell whether the
 * call took effect, so it retries, and the retry allocated a second id and
 * wrote a second file: two timeouts left `x09903` and `x09904` for one
 * intended proposal. A create is only safe to repeat if the repeat
 * recognises its own earlier write.
 *
 * Recognition is deliberately narrow: same kind prefix, same slug, same
 * status and a frontmatter title equal to the one asked for, in this
 * checkout's tree. A proposal of the same title that has moved on to
 * another status is a different piece of work and is not reused.
 */
import { join } from 'node:path';

import { PROPOSAL_SCAN_FOLDERS } from '../contracts/constants/proposal-glossary.constant';
import {
	DEFAULT_ALLOCATOR_FS,
	type IAllocatorFs,
} from './proposal-id-allocator-fs';

export interface IExistingProposal {
	readonly id: string;
	/** Path relative to the proposals directory, `/`-separated. */
	readonly file: string;
}

export interface IExistingProposalQuery {
	readonly proposalsDirAbs: string;
	readonly prefix: string;
	readonly slug: string;
	readonly title: string;
	readonly status: string;
}

const FRONTMATTER_FIELD = (name: string, text: string): string | undefined =>
	new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'mu').exec(
		text.slice(0, text.indexOf('\n---', 4) + 1 || undefined),
	)?.[1];

const titleOf = (raw: string | undefined): string | undefined => {
	if (raw === undefined) return undefined;
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === 'string' ? parsed : undefined;
	} catch {
		return raw;
	}
};

export const findExistingProposal = async (
	query: IExistingProposalQuery,
	fs: IAllocatorFs = DEFAULT_ALLOCATOR_FS,
): Promise<IExistingProposal | undefined> => {
	const name = new RegExp(
		`^(${query.prefix}\\d{5,})-${query.slug}\\.md$`,
		'u',
	);
	for (const folder of PROPOSAL_SCAN_FOLDERS) {
		const dir =
			folder === ''
				? query.proposalsDirAbs
				: join(query.proposalsDirAbs, folder);
		for (const entry of await fs.list(dir)) {
			const id = entry.isFile ? name.exec(entry.name)?.[1] : undefined;
			if (id === undefined) continue;
			const text = await fs.read(join(dir, entry.name));
			if (
				text !== null &&
				FRONTMATTER_FIELD('status', text) === query.status &&
				titleOf(FRONTMATTER_FIELD('title', text)) === query.title
			) {
				return {
					id,
					file:
						folder === '' ? entry.name : `${folder}/${entry.name}`,
				};
			}
		}
	}
	return undefined;
};
