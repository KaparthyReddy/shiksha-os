# Contributing

1. Fork and create a branch: `feat/<name>` or `fix/<name>`.
2. `pnpm install && pnpm infra:up`
3. Before opening a PR: `pnpm lint && pnpm typecheck && pnpm test`
4. Keep PRs focused, and add tests for logic in `packages/exam-engine` and `apps/api`.
5. Every tenant-scoped table must have a Row-Level Security policy. PRs that skip this will not be merged.
