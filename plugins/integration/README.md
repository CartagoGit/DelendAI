# @delendai/integration

From a ready pull request to a merged commit and a told session, proven on
the real forge before it runs.

```bash
delendai --plugins=integration
delendai integration rehearse --mode=fast --scenarios=<ids|all>
```

The rehearsal creates `<namespace>/rehearsal/<run>/…` branches from the tip
of the integration branch, opens synthetic pull requests that touch only
`rehearsal/**`, reads back what the forge did and prints a JSON report and a
short table. It never writes to the integration or release branch, and its
cleanup deletes every branch, label and webhook it made.

`gh` acts as whatever it is already signed in as; the plugin never reads or
prints a token.

## Adopt it in another project

Nothing of the repository that develops delendai is emitted into yours: the
validations are your own required checks and your own CI.

1. Set the options in `delendai.config.json` under `development.integration`:
   `requiredChecks` (your CI jobs), `zones`, `derived` (`paths` and the
   `command` that regenerates them), `identity`, `signalWorkflows` and
   `scanWorkflows`. Every option has a default; with `engine: none` nothing acts.
2. Run `delendai integration adopt [--needs=<job,job>]`. It writes
   `.github/workflows/land.yml` (the integrator),
   `.github/workflows/land-signal.yml` (what wakes it) and
   `.github/workflows/rehearsal.yml`, pinned to this CLI's version, and prints
   the `integration-signal` job. Append that job to your own CI: it runs last
   and wakes the integrator.
3. Set up the identity once (below).
4. Run `delendai integration rehearse --mode=fast` (or `--mode=real`, which
   runs your own `ci.yml` and `codeql.yml` on the rehearsal branch). It
   plays every scenario on `<namespace>/rehearsal/<run>/…` branches and
   cleans up after itself.
5. Activate once the rehearsal is green on every scenario and target.

### How the land is woken

The land never listens to `pull_request_target`, for two GitHub facts: since
2025-12-08 GitHub takes a `pull_request_target` workflow file from the
repository's default branch whatever the pull request's base, so a `land.yml`
on the integration branch never starts on a pull request event; and from
2026-12-02 public repositories without an event policy block
`pull_request_target` by default.

Instead `land-signal.yml` (on `pull_request` into the integration branch:
opened, reopened, synchronize, ready_for_review, labeled, unlabeled,
converted_to_draft, closed) and the `integration-signal` job at the end of
your CI each run `gh workflow run land.yml --ref <base ref> -f pr=<number>`
with the workflow token. That token holds `actions: write` and
`contents: read` only, checks out no code and never holds the identity; a
refused dispatch warns and fails nothing. The pass runs from the base
branch's `land.yml` as the identity, and a dispatch with an empty `pr` runs
the full pass. A push to the integration branch and the watchdog schedule
still wake it too.

### The identity

The integrator acts as a GitHub App, never as the workflow token (GitHub
starts no workflow for what that token pushes). Run
`delendai integration doctor --manifest` to print the App manifest, create the
App, install it on the repository, then add its id as a repository variable
and its private key as a repository secret under the names your policy gives
`identity` (defaults: variable `DELENDAI_APP_ID`, secret
`DELENDAI_APP_PRIVATE_KEY`). `delendai integration doctor` checks all three.
A project that cannot install an App sets `identity.kind: pat` and a token
secret (default name `DELENDAI_INTEGRATOR_TOKEN`).
