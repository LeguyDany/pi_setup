/**
 * Plan Mode Extension
 *
 * Adds BUILD, PLAN, and CONVERSE modes.
 * PLAN and CONVERSE are read-only; BUILD has normal tool access.
 *
 * Features:
 * - Tab cycles BUILD -> PLAN -> CONVERSE -> BUILD
 * - /plan toggles PLAN mode
 * - /converse toggles CONVERSE mode
 * - Bash restricted to allowlisted read-only commands in PLAN/CONVERSE
 * - PLAN extracts numbered plan steps and asks what to do next
 * - CONVERSE allows free read-only conversation without plan acceptance prompts
 * - [DONE:n] markers complete steps during execution
 * - Progress tracking widget during execution
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { extractTodoItems, isSafeCommand, markCompletedSteps, type TodoItem } from "./utils.js";

// Tools
const READ_ONLY_TOOLS = ["read", "bash", "grep", "find", "ls"];
const PLAN_MODE_TOOLS = READ_ONLY_TOOLS;
const CONVERSE_MODE_TOOLS = READ_ONLY_TOOLS;
const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];
const PLAN_EXECUTION_TOOLS = [...NORMAL_MODE_TOOLS, "plan_step_done"];
type Mode = "build" | "plan" | "converse";

// Type guard for assistant messages
function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

// Extract text content from an assistant message
function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

export default function planModeExtension(pi: ExtensionAPI): void {
	let mode: Mode = "build";
	let executionMode = false;
	let todoItems: TodoItem[] = [];

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	function updateStatus(ctx: ExtensionContext): void {
		// Footer status
		if (executionMode && todoItems.length > 0) {
			const completed = todoItems.filter((t) => t.completed).length;
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", `📋 ${completed}/${todoItems.length}`));
		} else if (mode === "plan") {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "⏸ PLAN"));
		} else if (mode === "converse") {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", "💬 CONVERSE"));
		} else {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("success", "▶ BUILD"));
		}

		// Widget showing todo list
		if (executionMode && todoItems.length > 0) {
			const lines = todoItems.map((item) => {
				if (item.completed) {
					return (
						ctx.ui.theme.fg("success", "☑ ") + ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text))
					);
				}
				return `${ctx.ui.theme.fg("muted", "☐ ")}${item.text}`;
			});
			ctx.ui.setWidget("plan-todos", lines);
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	function activeToolsForMode(): string[] {
		if (mode === "plan") return PLAN_MODE_TOOLS;
		if (mode === "converse") return CONVERSE_MODE_TOOLS;
		if (executionMode) return PLAN_EXECUTION_TOOLS;
		return NORMAL_MODE_TOOLS;
	}

	function setMode(nextMode: Mode, ctx: ExtensionContext): void {
		mode = nextMode;
		executionMode = false;
		todoItems = [];

		pi.setActiveTools(activeToolsForMode());
		if (mode === "plan") {
			ctx.ui.notify(`PLAN mode enabled. Tools: ${PLAN_MODE_TOOLS.join(", ")}`);
		} else if (mode === "converse") {
			ctx.ui.notify(`CONVERSE mode enabled. Tools: ${CONVERSE_MODE_TOOLS.join(", ")}`);
		} else {
			ctx.ui.notify("BUILD mode enabled. Full access restored.");
		}
		updateStatus(ctx);
		persistState();
	}

	function cycleMode(ctx: ExtensionContext): void {
		if (mode === "build") setMode("plan", ctx);
		else if (mode === "plan") setMode("converse", ctx);
		else setMode("build", ctx);
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		setMode(mode === "plan" ? "build" : "plan", ctx);
	}

	function toggleConverseMode(ctx: ExtensionContext): void {
		setMode(mode === "converse" ? "build" : "converse", ctx);
	}

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			mode,
			enabled: mode === "plan", // backward compatibility for older extension versions
			todos: todoItems,
			executing: executionMode,
		});
	}

	function finishExecution(ctx: ExtensionContext): void {
		executionMode = false;
		todoItems = [];
		pi.setActiveTools(activeToolsForMode());
		updateStatus(ctx);
		persistState(); // Save cleared state so resume doesn't restore old execution mode
	}

	function sendPlanComplete(ctx: ExtensionContext): void {
		const completedList = todoItems.map((t) => `~~${t.text}~~`).join("\n");
		pi.sendMessage(
			{ customType: "plan-complete", content: `**Plan Complete!** ✓\n\n${completedList}`, display: true },
			{ triggerTurn: false },
		);
		finishExecution(ctx);
	}

	function completeStep(step: number, ctx: ExtensionContext): { ok: boolean; message: string } {
		if (!executionMode || todoItems.length === 0) {
			return { ok: false, message: "No plan is currently executing." };
		}

		const item = todoItems.find((t) => t.step === step);
		if (!item) {
			return { ok: false, message: `Invalid plan step: ${step}.` };
		}
		if (item.completed) {
			return { ok: true, message: `Step ${step} was already marked complete.` };
		}

		item.completed = true;
		updateStatus(ctx);
		persistState();

		if (todoItems.every((t) => t.completed)) {
			sendPlanComplete(ctx);
		}

		return { ok: true, message: `Marked step ${step} complete: ${item.text}` };
	}

	function updateProgressFromText(text: string, ctx: ExtensionContext): void {
		if (!executionMode || todoItems.length === 0) return;

		if (markCompletedSteps(text, todoItems) > 0) {
			updateStatus(ctx);
			persistState();
		}
	}

	pi.registerTool({
		name: "plan_step_done",
		label: "Plan Step Done",
		description: "Mark a plan TODO step complete immediately after finishing it during plan execution.",
		promptSnippet: "Mark a tracked plan step complete during plan execution",
		promptGuidelines: [
			"Use plan_step_done immediately after finishing each numbered plan step during plan execution so the TODO widget updates right away.",
		],
		parameters: Type.Object({
			step: Type.Integer({ description: "The numbered plan step that was completed" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = completeStep(params.step, ctx);
			return {
				content: [{ type: "text", text: result.message }],
				isError: !result.ok,
				details: { step: params.step, completed: result.ok },
			};
		},
	});

	pi.registerCommand("plan", {
		description: "Toggle plan mode (read-only exploration)",
		handler: async (_args, ctx) => togglePlanMode(ctx),
	});

	pi.registerCommand("converse", {
		description: "Toggle converse mode (read-only free conversation)",
		handler: async (_args, ctx) => toggleConverseMode(ctx),
	});

	pi.registerCommand("todos", {
		description: "Show current plan todo list",
		handler: async (_args, ctx) => {
			if (todoItems.length === 0) {
				ctx.ui.notify("No todos. Press Tab or use /plan to enter PLAN mode first", "info");
				return;
			}
			const list = todoItems.map((item, i) => `${i + 1}. ${item.completed ? "✓" : "○"} ${item.text}`).join("\n");
			ctx.ui.notify(`Plan Progress:\n${list}`, "info");
		},
	});

	pi.registerShortcut(Key.tab, {
		description: "Cycle BUILD/PLAN/CONVERSE mode",
		handler: async (ctx) => cycleMode(ctx),
	});

	// Block destructive bash commands in PLAN and CONVERSE modes
	pi.on("tool_call", async (event) => {
		if ((mode !== "plan" && mode !== "converse") || event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!isSafeCommand(command)) {
			return {
				block: true,
				reason: `${mode === "plan" ? "Plan" : "Converse"} mode: command blocked (not allowlisted). Press Tab to cycle to BUILD mode first.\nCommand: ${command}`,
			};
		}
	});

	// Filter out stale mode context that does not match the current mode
	pi.on("context", async (event) => {
		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (msg.customType === "plan-mode-context") return mode === "plan";
				if (msg.customType === "converse-mode-context") return mode === "converse";
				if (msg.role !== "user") return true;

				const content = msg.content;
				if (typeof content === "string") {
					if (content.includes("[PLAN MODE ACTIVE]")) return mode === "plan";
					if (content.includes("[CONVERSE MODE ACTIVE]")) return mode === "converse";
					return true;
				}
				if (Array.isArray(content)) {
					return !content.some((c) => {
						if (c.type !== "text") return false;
						const text = (c as TextContent).text ?? "";
						return (
							(text.includes("[PLAN MODE ACTIVE]") && mode !== "plan") ||
							(text.includes("[CONVERSE MODE ACTIVE]") && mode !== "converse")
						);
					});
				}
				return true;
			}),
		};
	});

	// Inject plan/converse/execution context before agent starts
	pi.on("before_agent_start", async () => {
		if (mode === "plan") {
			return {
				message: {
					customType: "plan-mode-context",
					content: `[PLAN MODE ACTIVE]
You are in plan mode - a read-only exploration mode for safe code analysis.

Restrictions:
- You can only use: read, bash, grep, find, ls
- You CANNOT use: edit, write (file modifications are disabled)
- Bash is restricted to an allowlist of read-only commands

Ask clarifying questions before writing the plan when needed.

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

Do NOT attempt to make changes - just describe what you would do.`,
					display: false,
				},
			};
		}

		if (mode === "converse") {
			return {
				message: {
					customType: "converse-mode-context",
					content: `[CONVERSE MODE ACTIVE]
You are in converse mode - a read-only free conversation mode.

Restrictions:
- You can only use: read, bash, grep, find, ls
- You CANNOT use: edit, write (file modifications are disabled)
- Bash is restricted to an allowlist of read-only commands

Respond conversationally. Answer questions, discuss options, brainstorm, explain tradeoffs, and ask clarifying questions when useful.
Do NOT require or produce a formal plan unless the user explicitly asks for one.
Do NOT ask the user to accept a plan.
Do NOT attempt to make changes.`,
					display: false,
				},
			};
		}

		if (executionMode && todoItems.length > 0) {
			const remaining = todoItems.filter((t) => !t.completed);
			const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			return {
				message: {
					customType: "plan-execution-context",
					content: `[EXECUTING PLAN - Full tool access enabled]

Remaining steps:
${todoList}

Execute each step in order.
After completing each step, immediately call the plan_step_done tool with that step number so the TODO list updates right away.
If the tool is unavailable, include a [DONE:n] tag in your response as a fallback.`,
					display: false,
				},
			};
		}
	});

	// Track progress while the assistant streams and after each turn
	pi.on("message_update", async (event, ctx) => {
		if (!isAssistantMessage(event.message as AgentMessage)) return;
		updateProgressFromText(getTextContent(event.message as AssistantMessage), ctx);
	});

	pi.on("message_end", async (event, ctx) => {
		if (!isAssistantMessage(event.message as AgentMessage)) return;
		updateProgressFromText(getTextContent(event.message as AssistantMessage), ctx);
	});

	pi.on("turn_end", async (event, ctx) => {
		if (!isAssistantMessage(event.message)) return;
		updateProgressFromText(getTextContent(event.message), ctx);
		persistState();
	});

	// Handle plan completion and plan mode UI
	pi.on("agent_end", async (event, ctx) => {
		// Check if execution is complete
		if (executionMode && todoItems.length > 0) {
			if (todoItems.every((t) => t.completed)) {
				sendPlanComplete(ctx);
			}
			return;
		}

		if (mode !== "plan" || !ctx.hasUI) return;

		// Extract todos from last assistant message
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (lastAssistant) {
			const extracted = extractTodoItems(getTextContent(lastAssistant));
			if (extracted.length > 0) {
				todoItems = extracted;
				persistState();
			}
		}

		// Show plan steps and prompt for next action
		if (todoItems.length > 0) {
			const todoListText = todoItems.map((t, i) => `${i + 1}. ☐ ${t.text}`).join("\n");
			pi.sendMessage(
				{
					customType: "plan-todo-list",
					content: `**Plan Steps (${todoItems.length}):**\n\n${todoListText}`,
					display: true,
				},
				{ triggerTurn: false },
			);
		}

		const choice = await ctx.ui.select("Plan mode - what next?", [
			todoItems.length > 0 ? "Execute the plan (track progress)" : "Execute the plan",
			"Stay in plan mode",
			"Refine the plan",
		]);

		if (choice?.startsWith("Execute")) {
			mode = "build";
			executionMode = todoItems.length > 0;
			pi.setActiveTools(activeToolsForMode());
			updateStatus(ctx);
			persistState();

			const execMessage =
				todoItems.length > 0
					? `Execute the plan. Start with: ${todoItems[0].text}`
					: "Execute the plan you just created.";
			pi.sendMessage(
				{ customType: "plan-mode-execute", content: execMessage, display: true },
				{ triggerTurn: true },
			);
		} else if (choice === "Refine the plan") {
			const refinement = await ctx.ui.editor("Refine the plan:", "");
			if (refinement?.trim()) {
				pi.sendUserMessage(refinement.trim());
			}
		}
	});

	// Restore state on session start/resume
	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true) {
			mode = "plan";
		}

		const entries = ctx.sessionManager.getEntries();

		// Restore persisted state
		const planModeEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "plan-mode")
			.pop() as { data?: { mode?: Mode; enabled?: boolean; todos?: TodoItem[]; executing?: boolean } } | undefined;

		if (planModeEntry?.data) {
			mode = planModeEntry.data.mode ?? (planModeEntry.data.enabled ? "plan" : mode);
			todoItems = planModeEntry.data.todos ?? todoItems;
			executionMode = planModeEntry.data.executing ?? executionMode;
		}

		// On resume: re-scan messages to rebuild completion state
		// Only scan messages AFTER the last "plan-mode-execute" to avoid picking up [DONE:n] from previous plans
		const isResume = planModeEntry !== undefined;
		if (isResume && executionMode && todoItems.length > 0) {
			// Find the index of the last plan-mode-execute entry (marks when current execution started)
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as { type: string; customType?: string };
				if (entry.customType === "plan-mode-execute") {
					executeIndex = i;
					break;
				}
			}

			// Only scan messages after the execute marker
			const messages: AssistantMessage[] = [];
			for (let i = executeIndex + 1; i < entries.length; i++) {
				const entry = entries[i];
				if (entry.type === "message" && "message" in entry && isAssistantMessage(entry.message as AgentMessage)) {
					messages.push(entry.message as AssistantMessage);
				}
			}
			const allText = messages.map(getTextContent).join("\n");
			markCompletedSteps(allText, todoItems);
		}

		pi.setActiveTools(activeToolsForMode());
		updateStatus(ctx);
	});
}
