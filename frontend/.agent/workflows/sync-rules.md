---
description: Synchronize common coding rules from .agent/rules/common.md to all Agent config files.
---

1. Ensure you have modified `.agent/rules/common.md` with the latest rules.
2. Run the synchronization script:
// turbo
```bash
node scripts/sync-rules.mjs
```
3. Verify that `GEMINI.md`, `CLAUDE.md`, `Agent.md`, and `.cursorrules` have been updated.
