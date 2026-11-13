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
   `.github/workflows/land.yml` (the integrator) and
   `.github/workflows/rehearsal.yml`, pinned to this CLI's version, and prints
   the `integration-signal` job. Append that job to your own CI: it runs last
   and wakes the integrator.
3. Set up the identity once (below).
4. Run `delendai integration rehearse --mode=fast` (or `--mode=real`, which
   runs your own `ci.yml` and `codeql.yml` on the rehearsal branch). It
   plays every scenario on `<namespace>/rehearsal/<run>/…` branches and
   cleans up after itself.
5. Activate once the rehearsal is green on every scenario and target.

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
