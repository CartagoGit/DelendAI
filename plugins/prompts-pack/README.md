# @delendai/prompts-pack

`@delendai/prompts-pack` ships six reusable MCP prompts for common coding flows. Each prompt is pure text composition over tools that already exist in the workspace. The plugin does not call models, does not perform I/O in the prompt templates, and does not couple itself to any provider routing.

## Prompts

- `explain-this-code` — explain a file or line range, grounded with refactor definition and reference lookups.
- `generate-docstrings` — generate JSDoc/TSDoc for exported declarations in a file.
- `write-tests-for` — write tests that follow the workspace test-convention and suggested spec placement.
- `review-this-diff` — structure a diff review around git context, quality gates, and security posture.
- `security-audit-this-file` — focus a security review on one file while pulling in project-level posture tools.
- `optimize-this` — drive a performance pass with benchmark, bundle, and profile signals.

## Composition pattern

Every prompt references shipped MCP tool IDs instead of embedding execution logic. That keeps the prompts deterministic and reusable across hosts:

- comprehension prompts compose `refactor_*`
- test prompts compose `test-convention_*`
- review prompts compose `git_*`, `quality_*`, and `security_*`
- security/perf prompts compose `security_*`, `env_*`, and `perf_*`

The prompts are parameterized by file path, optional line range, or diff range. They never hardcode project paths, provider names, or network/model calls.