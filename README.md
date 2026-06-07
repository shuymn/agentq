# agentq

Agent Queue is a local coordination CLI for handoffs between coding agents working in the
same workspace. A Room is derived from the canonical current working directory, and
Waiters identify themselves with Agent Environment tokens instead of runtime-specific
role inference.

## Documentation

- Domain language: [`CONTEXT.md`](CONTEXT.md)
- Adapter JSON contract: [`docs/adapter-contract.md`](docs/adapter-contract.md)
- Capabilities intentionally outside core: [`docs/negative-space.md`](docs/negative-space.md)

## Local Setup

```bash
bun install
```

`postinstall` runs `lefthook install` automatically.

## CLI

```bash
bun run agentq join --as codex
bun run agentq listen --as pi -- pi
bun run agentq handoff --body "implementation ready"
bun run agentq current
bun run agentq current --full
bun run agentq done --body "review complete" --artifact ./review.md
bun run agentq status
bun run agentq status --full
bun run agentq dismiss
```

`current` and `status` default to summary JSON for adapter polling and agent context. Use
`--full` when scripts need the complete shape documented in `docs/adapter-contract.md`.

Set `AGENTQ_DATA_DIR` to isolate or relocate the local SQLite database and artifact
directory. If it is unset, Agent Queue uses the default user-local data directory.

## Local Development

Useful commands:

```bash
bun run lint
bun run lint:fix
bun run fmt:check
bun run fmt:fix
bun run typecheck
bun run test
bun run check:fast
bun run check
```
