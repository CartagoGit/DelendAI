# shell_status

Call `shell_status` the first time a session is about to use the terminal,
especially before running commands that depend on a shell dialect, pager
configuration, or optional binaries.

Use the default compact response for orientation. Set `refresh: true` when the
environment may have changed, or pass `names` when only a small tool inventory
is relevant. `verbose` is reserved for callers that need the complete terminal
capability matrix.

Interpret `terminal.invocation.safeModes` before choosing synchronous or
asynchronous execution. When `paged` is true, apply the returned environment
overrides and no-pager flags. Treat `confidence: inferred` as advisory and use
the bash-safe invocation rule when the shell cannot be measured reliably.

Missing tools may include `suggestInstall`. Suggestions are informational only:
show them to the user and never execute an installation automatically.