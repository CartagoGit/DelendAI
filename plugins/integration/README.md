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
