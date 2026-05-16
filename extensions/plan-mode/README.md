# Plan Mode

Custom Pi extension installed globally.

## Modes

- **BUILD** (`▶ BUILD`) - normal tool access: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`.
- **PLAN** (`⏸ PLAN`) - read-only exploration for creating a numbered plan. Pi will ask whether to execute/refine/stay after a plan is produced.
- **CONVERSE** (`💬 CONVERSE`) - read-only free conversation. Pi can inspect files, but will not edit/build and will not ask you to accept a plan.

## Controls

- Press `Tab` to cycle: `BUILD → PLAN → CONVERSE → BUILD`.
- `/plan` toggles PLAN mode directly.
- `/converse` toggles CONVERSE mode directly.
- `/todos` shows current tracked plan progress.

## TODO progress

When you execute a plan, Pi tracks the numbered plan steps in a TODO widget. After each step is completed, the assistant calls the `plan_step_done` tool so the widget and footer update immediately from `☐` to `☑`. `[DONE:n]` response markers are still supported as a fallback.

PLAN and CONVERSE allow only read-only tools: `read`, `bash`, `grep`, `find`, `ls`.
Bash is restricted to an allowlist of read-only commands in both modes.

Note: bare `Tab` normally does autocomplete. This extension intentionally takes over Tab while loaded.
