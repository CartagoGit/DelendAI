/**
 * development-policy-required-checks.ts — the checks a pull-request
 * profile can honestly require, read from the project's own workflows.
 *
 * A profile cannot know what a project's CI calls its checks, and
 * inventing a name locks the branch behind a context nobody produces.
 * So the name is READ: the job of a workflow that runs on pull requests.
 * Only an unambiguous answer counts — one job, or one job that is
 * plainly the aggregate. Anything else is "not derivable", which
 * adoption treats as "cannot require checks", never as permission to
 * guess.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface IDerivedRequiredChecks {
	readonly checks: readonly string[];
	readonly reason: string;
}

const WORKFLOWS_DIRECTORY = '.github/workflows';
const RUNS_ON_PULL_REQUESTS = /\bpull_request(_target)?\b/u;
const AGGREGATE_JOB =
	/^(ci[-_ ]?)?(complete|all|gate|required|status|success)\b|[-_ ](complete|gate|required)$/iu;

const unquote = (value: string): string =>
	value
		.replace(/\s+#.*$/u, '')
		.trim()
		.replace(/^(['"])(.*)\1$/u, '$2');

/**
 * The check context each job of one workflow reports: its `name`, or its
 * id when it has none. Read line by line — a key at the job indent is
 * all this needs, and a YAML parser would be a dependency for it.
 */
export const jobChecksOf = (workflow: string): readonly string[] => {
	const lines = workflow.split('\n');
	const start = lines.findIndex((line) => /^jobs:\s*$/u.test(line));
	if (start === -1) return [];
	const checks: string[] = [];
	let id: string | undefined;
	let name: string | undefined;
	const flush = (): void => {
		if (id !== undefined) checks.push(name ?? id);
	};
	for (const line of lines.slice(start + 1)) {
		if (/^\S/u.test(line)) break;
		const job = /^ {2}([\w-]+):\s*$/u.exec(line);
		if (job !== null) {
			flush();
			id = job[1];
			name = undefined;
			continue;
		}
		const label = /^ {4}name:\s*(.+)$/u.exec(line);
		if (label !== null && id !== undefined && name === undefined) {
			name = unquote(label[1] ?? '');
		}
	}
	flush();
	return checks;
};

/** The one check that stands for the workflow, or none when unclear. */
export const gateCheckOf = (checks: readonly string[]): string | undefined => {
	const unique = [...new Set(checks)];
	if (unique.length === 1) return unique[0];
	const aggregates = unique.filter((check) => AGGREGATE_JOB.test(check));
	return aggregates.length === 1 ? aggregates[0] : undefined;
};

const readWorkflows = async (
	workspaceRoot: string,
): Promise<readonly string[]> => {
	try {
		const entries = await readdir(join(workspaceRoot, WORKFLOWS_DIRECTORY));
		const files = entries.filter((entry) => /\.ya?ml$/u.test(entry)).sort();
		return await Promise.all(
			files.map((file) =>
				readFile(
					join(workspaceRoot, WORKFLOWS_DIRECTORY, file),
					'utf8',
				),
			),
		);
	} catch {
		return [];
	}
};

export const deriveRequiredChecks = async (
	workspaceRoot: string,
): Promise<IDerivedRequiredChecks | undefined> => {
	const onPullRequests = (await readWorkflows(workspaceRoot)).filter(
		(workflow) => RUNS_ON_PULL_REQUESTS.test(workflow),
	);
	const gates = onPullRequests
		.map((workflow) => gateCheckOf(jobChecksOf(workflow)))
		.filter((check): check is string => check !== undefined);
	const unique = [...new Set(gates)];
	return unique.length === 1 && onPullRequests.length === 1
		? {
				checks: unique,
				reason: `requires \`${unique[0] ?? ''}\`: the job of the one workflow under ${WORKFLOWS_DIRECTORY} that runs on pull requests.`,
			}
		: undefined;
};
