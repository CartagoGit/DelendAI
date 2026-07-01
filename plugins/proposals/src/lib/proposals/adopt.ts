// Adoption analysis for an existing proposals folder (clear, human-followable).
//
// When mcp-vertex is dropped into a project that already has a proposals dir,
// the agent needs to (1) understand the canonical layout and (2) see how the
// current folder maps onto it and what to do. `analyzeProposals` is the pure
// brain: given a directory listing (+ light frontmatter), it classifies every
// entry, explains the convention, and produces an actionable plan — no I/O.

/** The canonical, documented layout under `<docsDir>/proposals/`. */
export const PROPOSALS_LAYOUT = {
	root: '<docsDir>/proposals  (default docs/mcp-vertex/proposals)',
	files: {
		'index.json':
			'machine-readable registry of every proposal (run sync_proposals to (re)build it)',
		'README.md': 'human guide to this folder (what each file/bucket is)',
		'p<N>-<kebab-title>.md':
			'a proposal (feature/refactor); frontmatter: id, type, status',
		'f<N>-<kebab-title>.md':
			'a fix; cascades BEFORE proposals (f before p)',
	},
	folders: {
		'done/':
			'completed + verified proposals, archived out of the active set',
		'<bucket>/':
			'optional host buckets (e.g. paused/, audits/) declared via the plugin `extraFolders` option',
	},
} as const;

export type IProposalKind = 'proposal' | 'fix';

export interface IScanEntry {
	readonly name: string;
	readonly isDir: boolean;
	/** Light frontmatter of a `.md` file, if present. */
	readonly frontmatter?: {
		id?: string;
		status?: string;
		type?: string;
	} | null;
}

export interface IScannedProposal {
	readonly file: string;
	readonly id: string;
	readonly kind: IProposalKind;
	readonly status: string;
}

export interface IAdoptionReport {
	readonly root: string;
	readonly layout: typeof PROPOSALS_LAYOUT;
	readonly scan: {
		readonly proposals: readonly IScannedProposal[];
		readonly folders: readonly string[];
		readonly hasIndex: boolean;
		readonly hasReadme: boolean;
		/** `.md` files with no proposal frontmatter (need review/convert). */
		readonly unrecognized: readonly string[];
		/** Non-markdown, non-index files. */
		readonly other: readonly string[];
	};
	readonly plan: readonly string[];
	/** True when the folder already matches the convention (index + structure). */
	readonly ready: boolean;
}

const DONE_STATES = new Set([
	'done',
	'closed',
	'completed',
	'merged',
	'shipped',
	'archived',
]);
const kindOf = (name: string, type: string | undefined): IProposalKind =>
	/^f\d/i.test(name) || type === 'fix' ? 'fix' : 'proposal';

/** Classify a directory listing against the canonical layout + build the plan. */
export const analyzeProposals = (
	root: string,
	entries: readonly IScanEntry[],
): IAdoptionReport => {
	const proposals: IScannedProposal[] = [];
	const folders: string[] = [];
	const unrecognized: string[] = [];
	const other: string[] = [];
	let hasIndex = false;
	let hasReadme = false;

	for (const entry of entries) {
		if (entry.isDir) {
			folders.push(entry.name);
			continue;
		}
		const lower = entry.name.toLowerCase();
		if (lower === 'index.json') {
			hasIndex = true;
			continue;
		}
		if (lower === 'readme.md') {
			hasReadme = true;
			continue;
		}
		if (lower.endsWith('.md')) {
			const fm = entry.frontmatter;
			if (fm && typeof fm.id === 'string' && fm.id.length > 0) {
				proposals.push({
					file: entry.name,
					id: fm.id,
					kind: kindOf(entry.name, fm.type),
					status: fm.status ?? 'unknown',
				});
			} else {
				unrecognized.push(entry.name);
			}
			continue;
		}
		other.push(entry.name);
	}

	const plan: string[] = [];
	if (!hasIndex) {
		plan.push(
			'Run `sync_proposals` to (re)build index.json from the markdown files.',
		);
	}
	if (!hasReadme) {
		plan.push(
			'Add a README.md describing the layout (see get_proposal_workflow for the convention).',
		);
	}
	const doneAtTop = proposals.filter((p) =>
		DONE_STATES.has(p.status.toLowerCase()),
	);
	if (
		doneAtTop.length > 0 &&
		!folders.some((f) => f.toLowerCase() === 'done')
	) {
		plan.push(
			`Archive ${doneAtTop.length} completed proposal(s) into a done/ folder: ${doneAtTop.map((p) => p.file).join(', ')}.`,
		);
	}
	if (unrecognized.length > 0) {
		plan.push(
			`Review ${unrecognized.length} markdown file(s) without proposal frontmatter (add id/type/status, or move out): ${unrecognized.join(', ')}.`,
		);
	}
	if (proposals.length === 0 && unrecognized.length === 0) {
		plan.push(
			'Empty proposals folder — create your first with `create_proposal`.',
		);
	}

	const ready = hasIndex && unrecognized.length === 0;
	return {
		root,
		layout: PROPOSALS_LAYOUT,
		scan: { proposals, folders, hasIndex, hasReadme, unrecognized, other },
		plan,
		ready,
	};
};
