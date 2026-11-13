import type { IRulePreset } from '../../contracts';

/**
 * Go (golangci-lint) preset — DATA only.
 *
 * Single Responsibility: the baseline `.golangci.yml` + bullets for
 * Go. The project's own `.golangci.yml` layers on top and wins;
 * `go vet` is the typecheck.
 */
export const GO_PRESET: IRulePreset = {
	id: 'go-golangci',
	framework: 'go',
	language: 'go',
	linter: 'golangci-lint',
	linterConfigFile: 'go-golangci.golangci.yml',
	linterConfigContent: `# Baseline golangci-lint config (the project's own .golangci.yml wins).
linters:
  enable:
    - govet
    - staticcheck
    - errcheck
    - ineffassign
`,
	conventions: [
		'Errors are values: wrap with `fmt.Errorf("...: %w", err)`, never panic in libraries.',
		'Exported identifiers are PascalCase; unexported are camelCase.',
		'Accept interfaces, return concrete types; keep interfaces small.',
		'Run `golangci-lint run ./...` and `go vet ./...` before committing.',
	],
	requiredLinterDeps: ['golangci-lint'],
};
