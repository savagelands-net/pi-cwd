import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type {
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";

import {
  directoryCompletionItems,
  extractCwdCommandArgument,
  resolveTargetDirectory,
} from "./paths.ts";
import { forkSessionToCwd } from "./session.ts";

const COMMANDS = ["cwd", "cd"] as const;
const MAX_COMPLETIONS = 50;

async function changeCwd(args: string | undefined, ctx: ExtensionCommandContext): Promise<void> {
  const requested = (args ?? "").trim();
  if (!requested) {
    ctx.ui.notify(`cwd: ${ctx.cwd}`, "info");
    return;
  }

  let targetCwd: string;
  try {
    targetCwd = resolveTargetDirectory(requested, ctx.cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(message, "error");
    return;
  }

  if (targetCwd === ctx.cwd) {
    ctx.ui.notify(`cwd already: ${ctx.cwd}`, "info");
    return;
  }

  const sourceSessionFile = ctx.sessionManager.getSessionFile();
  if (!sourceSessionFile) {
    ctx.ui.notify("Cannot change cwd for an ephemeral session", "error");
    return;
  }

  await ctx.waitForIdle();
  const forkedSessionFile = forkSessionToCwd(sourceSessionFile, targetCwd);
  const result = await ctx.switchSession(forkedSessionFile, {
    withSession: async (nextCtx) => {
      nextCtx.ui.notify(`cwd: ${nextCtx.cwd}`, "info");
    },
  });

  if (result.cancelled) {
    ctx.ui.notify("cwd change cancelled", "warning");
  }
}

function createCwdAutocompleteProvider(
  current: AutocompleteProvider,
  getCwd: () => string,
): AutocompleteProvider {
  return {
    async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
      const line = lines[cursorLine] ?? "";
      const beforeCursor = line.slice(0, cursorCol);
      const arg = extractCwdCommandArgument(beforeCursor);
      if (arg === undefined) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      const items = directoryCompletionItems(arg, getCwd()).slice(0, MAX_COMPLETIONS);
      if (items.length === 0) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      return {
        prefix: arg,
        items,
      };
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

function registerAutocomplete(ctx: ExtensionContext): void {
  ctx.ui.addAutocompleteProvider((current) => createCwdAutocompleteProvider(current, () => ctx.cwd));
}

export default function (pi: ExtensionAPI): void {
  for (const command of COMMANDS) {
    pi.registerCommand(command, {
      description:
        command === "cwd"
          ? "Show or change Pi's real session working directory"
          : "Alias for /cwd",
      handler: async (args, ctx) => changeCwd(args, ctx),
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) registerAutocomplete(ctx);
  });
}
