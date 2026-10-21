# Reliability, account isolation, AI and UI upgrade

This upgrade rechecked the current implementation instead of assuming the older audit remained accurate. Four parallel implementation owners covered workflow, security, AI and UI; an independent code reviewer checked integration and the account/grounding boundaries.

## Reproduced defects and fixes

| Area         | Reproduced failure                                               | Fix and coverage                                                                                     |
| ------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Checkpoints  | Concurrent heartbeat and transition could persist stale state    | Serial coordinator operations; overlapping submission/count regression                               |
| Resume       | Settled local pause overrode a resumed checkpoint                | Reconcile persisted intent; retain an in-flight manual stop                                          |
| Job context  | Refreshed list replaced enriched details                         | Merge refreshed cards while retaining known detail context                                           |
| Locations    | Exclusion mode rejected nonmatches                               | Correct skip/pass truth table                                                                        |
| JSON parsing | Repeated nested scanning and unbounded candidates                | Bounded single pass scanner; oversized and ambiguous inputs                                          |
| Settings     | Deep merge return discarded by reset/recommend                   | Assign cloned defaults to active state                                                               |
| Messaging    | Recipient metadata could be supplied independently of a job      | Resolve recipient from job context, require matching account and validate text before network lookup |
| Account data | Shared chat/cache/statistics data could cross account boundaries | Account namespaces, stale completion guards and no attribution of legacy unowned data                |
| AI previews  | Test agent mutated runtime agent state                           | Separate model instance and message state                                                            |
| Timeouts     | Provider and background ceilings differed                        | Shared effective ceiling of 300 seconds                                                              |

## AI behavior

The workspace stores up to 20 versions of user-confirmed applicant facts and roles. Confirmed conversation facts carry a source and job key. Preparation generates a local prompt; it does not contact a model automatically. Runtime screening validates the same parsed object consumed by the workflow and requires an actual source quotation for each scored reason. This validates evidence presence, not the semantic truth of a model's conclusion.

Requests reserve capacity in the background before execution. The default is 50 requests per UTC day and account, configurable between 1 and 1000. The usage ledger is separate from editable profile data and reservations serialize across clients. This is a request-count budget, not token or currency accounting. Failed dispatched requests consume a reservation. Connection probes and provider billing remain distinct from workflow request usage.

## Verification commands

```sh
npm run check
npm run lint
npm test
npm run build
npm run test:built
npm run test:e2e
npm run test:security
```

`npm test` includes state foundations, checkpoint overlap, cache initialization/write ordering, account namespaces, recipient binding, background budget concurrency, profile preparation, isolated preview wiring and grounded-output cases. Browser tests run against isolated extension profiles and fixture routes; live job submissions and messages are never used as tests.

The CI workflow runs typecheck, lint, tests, three browser builds, built artifact verification, Chrome fixture E2E, bridge security isolation and Chrome packaging. Node 24 and Bun 1.3.14 are explicit. Browser-specific runtime coverage is Chrome; Firefox and Edge are build-verified only. See [UI upgrade](ui-upgrade.md) for visual QA scope and the design inspector limitation.

## Operational boundaries

Switching the platform account invalidates active account-bound work. Refresh after an account switch to initialize statistics for the new identity. Legacy data without reliable account ownership stays unimported rather than being assigned to the current account. Local storage is not encrypted. Sending remains a deliberate user action; evidence checks do not authorize automatic conversation sends.

## Final local result

`npm run test:ci` completed successfully on 2026-10-21 with the integrated implementation. It ran all seven verification commands above. Chrome E2E reported five responsive/zoom-equivalent widths, ten SPA remounts, background and BFCache recovery, worker restart, lifecycle restart, manual pause, and zero browser errors. Bridge isolation also passed. Build output retained upstream Rollup annotation warnings and WXT's Firefox store data-collection declaration reminder; neither failed these checks.
