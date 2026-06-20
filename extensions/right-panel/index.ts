/**
 * Right Panel Extension
 *
 * Displays a right panel with the current working directory, git branch,
 * active model, and thinking effort level.
 */

import { execSync } from "child_process";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function rightPanelExtension(pi: ExtensionAPI): void {
	let lastCtx: ExtensionContext | undefined;

	const thinkingColorMap: Record<string, string> = {
		off: "thinkingOff",
		minimal: "thinkingMinimal",
		low: "thinkingLow",
		medium: "thinkingMedium",
		high: "thinkingHigh",
		xhigh: "thinkingXhigh",
	};

	function updatePanel(ctx: ExtensionContext): void {
		lastCtx = ctx;
		const theme = ctx.ui.theme;
		const cwd = process.cwd();
		const branch = getCurrentBranch();
		const pathWithBranch = branch ? `${cwd} (${branch})` : cwd;

		const modelName = ctx.model?.name ?? ctx.model?.id ?? "unknown";
		const thinkingLevel = pi.getThinkingLevel();
		const thinkingColor = thinkingColorMap[thinkingLevel] ?? "muted";

		ctx.ui.setWidget(
			"right-panel",
			[
				theme.fg("accent", "📁 Current Directory"),
				theme.fg("muted", pathWithBranch),
				theme.fg("dim", "· · ·"),
				theme.fg("accent", "🤖 Model"),
				`${modelName} ${theme.fg(thinkingColor, `(${thinkingLevel})`)}`,
			],
			{ placement: "right" },
		);
	}

	function getCurrentBranch(): string | null {
		try {
			return execSync("git branch --show-current", {
				encoding: "utf-8",
				stdio: ["ignore", "pipe", "ignore"],
				timeout: 1000,
			}).trim() || null;
		} catch {
			return null;
		}
	}

	// Update panel on session start
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.hasUI) {
			updatePanel(ctx);
		}
	});

	// Update panel on agent start
	pi.on("agent_start", async (_event, ctx) => {
		if (ctx.hasUI) {
			updatePanel(ctx);
		}
	});

	// Update panel on agent end
	pi.on("agent_end", async (_event, ctx) => {
		if (ctx.hasUI) {
			updatePanel(ctx);
		}
	});

	// Update panel on turn end
	pi.on("turn_end", async (_event, ctx) => {
		if (ctx.hasUI) {
			updatePanel(ctx);
		}
	});

	// Update panel on model change
	pi.on("model_select", async (_event, ctx) => {
		if (ctx.hasUI) {
			updatePanel(ctx);
		}
	});

	// Update panel on thinking level change
	pi.on("thinking_level_select", async (_event, ctx) => {
		if (ctx.hasUI) {
			updatePanel(ctx);
		}
	});

	// Cleanup on session shutdown
	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setWidget("right-panel", undefined);
		lastCtx = undefined;
	});
}