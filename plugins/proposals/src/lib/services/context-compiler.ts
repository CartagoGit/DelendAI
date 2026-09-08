import type { IProposalSearchHit } from './search';

export type TContextBand = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export interface IContextDocument {
	readonly uid: string;
	readonly kind: string;
	readonly status: string;
	readonly title: string;
	readonly contentHash?: string;
	readonly body?: string;
	readonly priority?: string;
	readonly updatedAt?: number;
	readonly relations?: readonly string[];
}

export interface ICompiledContextItem {
	readonly uid: string;
	readonly band: TContextBand;
	readonly text: string;
	readonly tokens: number;
	readonly score: number;
}

export interface ICompiledContext {
	readonly task: string;
	readonly maxTokens: number;
	readonly tokens: number;
	readonly bands: Readonly<Record<TContextBand, readonly ICompiledContextItem[]>>;
}

export interface ICompileContextArgs {
	readonly task: string;
	readonly maxTokens: number;
	readonly scope?: readonly string[];
}

export interface IContextCompilerDependencies {
	readonly search: (
		query: string,
	) => Promise<readonly IProposalSearchHit[]>;
	readonly getDocument: (uid: string) => Promise<IContextDocument | null>;
	readonly getSummary: (
		contentHash: string,
	) => Promise<string | null>;
	readonly recordCompileRun?: (record: ICompileRunMetrics) => Promise<void> | void;
}

export interface ICompileRunMetrics {
	readonly rowsConsidered: number;
	readonly rowsEmitted: number;
	readonly tokensInput: number;
	readonly tokensOutput: number;
	readonly cacheHits: number;
	readonly durationMs: number;
}

const BANDS: readonly TContextBand[] = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];

const tokenCount = (text: string): number =>
	Math.max(1, Math.ceil(text.trim().length / 4));

const importance = (document: IContextDocument): number => {
	if (document.priority === 'P0') return 4;
	if (document.priority === 'P1') return 3;
	if (document.priority === 'P2') return 2;
	return document.kind === 'breaking' ? 3 : 1;
};

const makeItem = (
	uid: string,
	band: TContextBand,
	text: string,
	score: number,
): ICompiledContextItem => ({
	uid,
	band,
	text,
	tokens: tokenCount(text),
	score,
});

const emptyBands = (): Record<TContextBand, ICompiledContextItem[]> => ({
	L0: [],
	L1: [],
	L2: [],
	L3: [],
	L4: [],
	L5: [],
});

const addDocumentBands = async (
	bands: Record<TContextBand, ICompiledContextItem[]>,
	hit: IProposalSearchHit,
	dependencies: IContextCompilerDependencies,
): Promise<void> => {
	const document = await dependencies.getDocument(hit.uid);
	if (document === null) return;
	const score =
		hit.score + importance(document) * -0.001 + (document.updatedAt ?? 0) * -1e-12;
	bands.L0.push(makeItem(hit.uid, 'L0', `${document.uid} ${document.status}`, score));
	bands.L1.push(
		makeItem(
			hit.uid,
			'L1',
			`${document.title} [${document.kind}]`,
			score,
		),
	);
	if (document.relations !== undefined && document.relations.length > 0) {
		bands.L2.push(makeItem(hit.uid, 'L2', document.relations.join('\n'), score));
	}
	const summary =
		document.contentHash === undefined
			? null
			: await dependencies.getSummary(document.contentHash);
	if (summary !== null) {
		bands.L3.push(makeItem(hit.uid, 'L3', summary, score));
	} else {
		bands.L4.push(makeItem(hit.uid, 'L4', hit.snippet, score));
		if (document.body !== undefined) {
			bands.L5.push(makeItem(hit.uid, 'L5', document.body, score));
		}
	}
};

export const compileContext = async (
	args: ICompileContextArgs,
	dependencies: IContextCompilerDependencies,
): Promise<ICompiledContext> => {
	const startedAt = Date.now();
	const hits = await dependencies.search(args.task);
	const scoped =
		args.scope === undefined
			? hits
			: hits.filter((hit) => args.scope?.includes(hit.uid) === true);
	const bands = emptyBands();
	for (const hit of scoped) await addDocumentBands(bands, hit, dependencies);
	for (const band of BANDS) {
		bands[band].sort((left, right) => left.score - right.score || left.uid.localeCompare(right.uid));
	}
	const output = emptyBands();
	let tokens = 0;
	let cacheHits = 0;
	for (const band of BANDS) {
		for (const item of bands[band]) {
			if (tokens + item.tokens > args.maxTokens) continue;
			output[band].push(item);
			tokens += item.tokens;
			if (item.band === 'L3') cacheHits += 1;
		}
	}
	const result = {
		task: args.task,
		maxTokens: args.maxTokens,
		tokens,
		bands: output,
	};
	await dependencies.recordCompileRun?.({
		rowsConsidered: scoped.length,
		rowsEmitted: new Set(Object.values(output).flat().map((item) => item.uid)).size,
		tokensInput: tokenCount(args.task),
		tokensOutput: tokens,
		cacheHits,
		durationMs: Math.max(0, Date.now() - startedAt),
	});
	return result;
};