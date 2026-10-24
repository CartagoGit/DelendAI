import z from 'zod';

const METADATA = z.object({
	name: z.string().optional(),
	namespace: z.string().optional(),
	uid: z.string().optional(),
	creationTimestamp: z.string().optional(),
});

const STATUS = z.object({
	phase: z.string().optional(),
	podIP: z.string().optional(),
	hostIP: z.string().optional(),
});

const RESOURCE = z.object({
	kind: z.string().optional(),
	apiVersion: z.string().optional(),
	metadata: METADATA.optional(),
	status: STATUS.optional(),
});

const LIST = z.object({
	kind: z.string().optional(),
	apiVersion: z.string().optional(),
	items: z.array(z.unknown()),
});

export interface IK8sRow {
	readonly kind: string;
	readonly apiVersion: string;
	readonly name: string;
	readonly namespace: string;
	readonly uid: string;
	readonly createdAt: string;
	readonly phase: string;
	readonly podIp: string;
	readonly hostIp: string;
}

export interface IK8sParseOutcome {
	readonly rows: readonly IK8sRow[];
	readonly skipped: number;
	readonly kind: string;
	readonly apiVersion: string;
	readonly parseError?: string;
}

const toRow = (value: unknown): IK8sRow | null => {
	const parsed = RESOURCE.safeParse(value);
	if (!parsed.success) return null;
	const metadata = parsed.data.metadata ?? {};
	const status = parsed.data.status ?? {};
	return {
		kind: parsed.data.kind ?? '',
		apiVersion: parsed.data.apiVersion ?? '',
		name: metadata.name ?? '',
		namespace: metadata.namespace ?? '',
		uid: metadata.uid ?? '',
		createdAt: metadata.creationTimestamp ?? '',
		phase: status.phase ?? '',
		podIp: status.podIP ?? '',
		hostIp: status.hostIP ?? '',
	};
};

export const parseKubectlGet = (raw: string): IK8sParseOutcome => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {
			rows: [],
			skipped: 1,
			kind: '',
			apiVersion: '',
			parseError: 'kubectl output was not valid JSON',
		};
	}
	if (typeof parsed !== 'object' || parsed === null) {
		return {
			rows: [],
			skipped: 1,
			kind: '',
			apiVersion: '',
			parseError: 'kubectl output was not a JSON object',
		};
	}
	const list = LIST.safeParse(parsed);
	if (list.success) {
		const rows: IK8sRow[] = [];
		let skipped = 0;
		for (const item of list.data.items) {
			const row = toRow(item);
			if (row === null) {
				skipped += 1;
			} else {
				rows.push(row);
			}
		}
		return {
			rows,
			skipped,
			kind: list.data.kind ?? '',
			apiVersion: list.data.apiVersion ?? '',
		};
	}
	const single = toRow(parsed);
	if (single !== null) {
		return {
			rows: [single],
			skipped: 0,
			kind: single.kind,
			apiVersion: single.apiVersion,
		};
	}
	return {
		rows: [],
		skipped: 1,
		kind: '',
		apiVersion: '',
		parseError: 'kubectl output did not match a supported resource shape',
	};
};
