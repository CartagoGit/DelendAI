/**
 * proposal-documents.fixture.ts — proposals written the way the
 * listener reads them: one markdown document per proposal, under the
 * proposals folder.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface IFixtureProposal {
	readonly id: string;
	readonly slices: readonly {
		readonly id: string;
		readonly status: string;
		readonly files?: readonly string[];
	}[];
}

/** Replace the proposals under `proposalsDirAbs` with exactly these. */
export const writeProposalDocuments = async (
	proposalsDirAbs: string,
	proposals: readonly IFixtureProposal[],
): Promise<void> => {
	const folder = join(proposalsDirAbs, 'in-progress');
	await rm(folder, { recursive: true, force: true });
	await mkdir(folder, { recursive: true });
	for (const proposal of proposals) {
		const slices = proposal.slices
			.map((slice) =>
				[
					`### ${slice.id} — ${slice.id}`,
					`- **Status**: ${slice.status}`,
					...((slice.files ?? []).length > 0
						? [
								`- **Files**: ${(slice.files ?? []).map((file) => `\`${file}\``).join(', ')}`,
							]
						: []),
				].join('\n'),
			)
			.join('\n\n');
		await writeFile(
			join(folder, `${proposal.id}-fixture.md`),
			`---\nid: ${proposal.id}\n---\n\n# ${proposal.id}\n\n## slices\n\n${slices}\n`,
			'utf8',
		);
	}
};
