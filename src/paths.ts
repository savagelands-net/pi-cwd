import { readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export interface DirectoryCompletionItem {
  value: string;
  label: string;
  description?: string;
}

export function expandHome(pathText: string, homeDir = homedir()): string {
  if (pathText === "~") return homeDir;
  if (pathText.startsWith("~/")) return join(homeDir, pathText.slice(2));
  return pathText;
}

export function resolvePathText(pathText: string, cwd: string, homeDir = homedir()): string {
  const expanded = expandHome(pathText.trim(), homeDir);
  if (!expanded) return cwd;
  return isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
}

export function resolveTargetDirectory(pathText: string, cwd: string, homeDir = homedir()): string {
  const resolved = resolvePathText(pathText, cwd, homeDir);
  let stat;
  try {
    stat = statSync(resolved);
  } catch {
    throw new Error(`Not a directory: ${pathText}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${pathText}`);
  }
  return realpathSync(resolved);
}

function completionSearch(rawInput: string, cwd: string, homeDir: string) {
  const raw = rawInput;
  const expanded = expandHome(raw, homeDir);
  const expandedIsAbsolute = isAbsolute(expanded);
  const endsWithSlash = raw.endsWith("/");

  const rawDir = endsWithSlash ? raw : dirname(raw);
  const rawBase = endsWithSlash ? "" : basename(raw);
  const rawPrefix = endsWithSlash ? raw : raw.slice(0, raw.length - rawBase.length);

  const expandedDir = endsWithSlash ? expanded : dirname(expanded);
  const searchDir = expandedIsAbsolute
    ? resolve(expandedDir)
    : resolve(cwd, expandedDir === "." ? "" : expandedDir);

  return { rawBase, rawPrefix, searchDir };
}

export function directoryCompletionItems(
  rawInput: string,
  cwd: string,
  homeDir = homedir(),
): DirectoryCompletionItem[] {
  const { rawBase, rawPrefix, searchDir } = completionSearch(rawInput, cwd, homeDir);
  let entries;
  try {
    entries = readdirSync(searchDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(rawBase))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({
      value: `${rawPrefix}${entry.name}/`,
      label: `${entry.name}/`,
      description: searchDir,
    }));
}

export function extractCwdCommandArgument(textBeforeCursor: string): string | undefined {
  const match = textBeforeCursor.match(/^\/(?:cwd|cd)(?:\s+(.*))?$/);
  if (!match) return undefined;
  return match[1] ?? "";
}
