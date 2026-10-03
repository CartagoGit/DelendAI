import type { IRulePreset } from '../../contracts';

/**
 * Python (ruff + basedpyright) preset — DATA only.
 *
 * Single Responsibility: the config file contents + agent-facing
 * bullets for Python. Detection lives in the Python adapter and the
 * legacy `detect-framework`; idioms live in `dogmas/python.dogma.ts`.
 * The baseline `ruff.toml` is layered under the project's own
 * `pyproject.toml [tool.ruff]`, which always wins.
 */
export const PYTHON_PRESET: IRulePreset = {
	id: 'python-ruff',
	framework: 'python',
	language: 'py',
	linter: 'ruff',
	linterConfigFile: 'python-ruff.ruff.toml',
	linterConfigContent: `# Baseline ruff config (the project's own pyproject.toml [tool.ruff] wins).
line-length = 88
target-version = "py312"

[lint]
select = ["E", "F", "I", "UP", "B"]
`,
	conventions: [
		'Use `from __future__ import annotations`; prefer type hints everywhere.',
		'EAFP over LBYL: `try/except` rather than pre-checking.',
		'snake_case for functions/variables, PascalCase for classes.',
		'Run `ruff check .` to lint and `ruff format .` to format.',
	],
	requiredLinterDeps: ['ruff'],
};
