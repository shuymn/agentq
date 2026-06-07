---
name: agentq-claude-code
description: Use Claude Code as an Agent Queue token-based Waiter.
---

# Agent Queue for Claude Code

When Claude Code is launched by:

```bash
agentq listen --as claude --after pi -- claude
```

Agent Queue passes `AGENTQ_TOKEN` in the Agent Environment. Use that token implicitly through:

```bash
agentq current --summary
```

Use `--full` when you need complete Baton or Artifact metadata. See `docs/adapter-contract.md`.

If `current` returns an assigned Baton, complete the requested follow-up work and submit:

```bash
agentq done --body "<completion summary>" --artifact <path>
```

Monitor or hook delivery should only detect that an assignment exists and present the Baton. Routing and identity must stay token-based; do not infer behavior from `claude` or any other Agent Role name.
