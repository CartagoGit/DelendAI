import {
	KIND_TO_DONE_SUBFOLDER,
	STATUS_TO_FOLDER,
	type IProposalKind,
	type IProposalStatus,
} from './constants/proposal-glossary.constant';

export type IProposalFolderMode = 'flat' | 'by-kind' | readonly IProposalKind[];

export type IProposalFolderPolicy = Readonly<
	Partial<Record<IProposalStatus, IProposalFolderMode>>
>;

export const DEFAULT_PROPOSAL_FOLDER_POLICY: IProposalFolderPolicy = {
	ready: 'by-kind',
	done: 'by-kind',
};

export const proposalKindSubfolder = (
	kind: IProposalKind | undefined,
): string | undefined =>
	kind === undefined ? undefined : KIND_TO_DONE_SUBFOLDER[kind];

export const proposalFolderFor = (
	status: IProposalStatus,
	kind: IProposalKind | undefined,
	policy: IProposalFolderPolicy = DEFAULT_PROPOSAL_FOLDER_POLICY,
): string => {
	const statusFolder = STATUS_TO_FOLDER[status];
	const mode = policy[status];
	const selected =
		mode === 'by-kind'
			? kind !== undefined
			: Array.isArray(mode) && kind !== undefined && mode.includes(kind);
	if (!selected) return statusFolder;
	const subfolder = proposalKindSubfolder(kind);
	return subfolder === undefined
		? statusFolder
		: `${statusFolder}/${subfolder}`;
};

export const proposalFoldersForPolicy = (
	policy: IProposalFolderPolicy = DEFAULT_PROPOSAL_FOLDER_POLICY,
): readonly string[] => {
	const folders = new Set<string>(Object.values(STATUS_TO_FOLDER));
	for (const [status, mode] of Object.entries(policy)) {
		const kinds =
			mode === 'by-kind'
				? (Object.keys(KIND_TO_DONE_SUBFOLDER) as IProposalKind[])
				: Array.isArray(mode)
					? mode
					: [];
		for (const kind of kinds) {
			const subfolder = proposalKindSubfolder(kind);
			if (subfolder === undefined) continue;
			folders.add(
				`${STATUS_TO_FOLDER[status as IProposalStatus]}/${subfolder}`,
			);
		}
	}
	return [...folders];
};
