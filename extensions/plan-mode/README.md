# Plan Mode

Custom Pi extension installed globally.

- Press `Tab` to toggle between PLAN and BUILD mode.
- Footer shows `⏸ PLAN` or `▶ BUILD`.
- `/plan` also toggles the mode.
- PLAN mode allows only read-only tools: `read`, `bash`, `grep`, `find`, `ls`.
- BUILD mode restores normal built-in tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`.

After installing/reloading, press `Tab` once to enter PLAN mode. Press `Tab` again to return to BUILD mode.

Note: bare `Tab` normally does autocomplete. This extension intentionally takes over Tab while loaded.
