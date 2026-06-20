# Right Panel Extension

Displays a right panel with useful information about your current workspace.

## Features

- **Current Directory**: Shows the current working directory path
- **Git Branch**: Appends the current git branch to the path, for example `/home/dany/.pi/agent (main)`
- **Active Model**: Shows the current model name
- **Thinking Effort**: Displays the current thinking level with color-coded indicator

## Display

The right panel automatically updates when:
- A session starts
- An agent starts or ends
- A turn completes
- The model is changed
- The thinking level is changed

## Technical Details

- Uses `placement: "right"` for right panel mounting
- Executes `git branch --show-current` to detect the active branch
- Reads model info from `ctx.model` and thinking level from `pi.getThinkingLevel()`
- Thinking levels are color-mapped to theme colors (`thinkingOff` through `thinkingXhigh`)
- Handles non-git repositories gracefully
