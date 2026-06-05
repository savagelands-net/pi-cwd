import { existsSync, statSync, writeFileSync } from "node:fs";

import {
  SessionManager,
  type FileEntry,
  type SessionEntry,
  type SessionHeader,
} from "@earendil-works/pi-coding-agent";

export interface ForkableSessionManager {
  getSessionFile(): string | undefined;
  getHeader(): SessionHeader | null;
  getEntries(): SessionEntry[];
}

function writeSessionFile(sessionFile: string, entries: FileEntry[]): void {
  writeFileSync(sessionFile, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, {
    flag: "wx",
  });
}

function getForkedSessionFile(forked: SessionManager): string {
  const forkedFile = forked.getSessionFile();
  if (!forkedFile) {
    throw new Error("Failed to create forked session for new cwd");
  }
  return forkedFile;
}

function isUnmaterializedSessionFile(sessionFile: string): boolean {
  return !existsSync(sessionFile) || statSync(sessionFile).size === 0;
}

export function forkSessionToCwd(
  sourceSessionFile: string,
  targetCwd: string,
  sessionDir?: string,
): string {
  return getForkedSessionFile(SessionManager.forkFrom(sourceSessionFile, targetCwd, sessionDir));
}

export function forkCurrentSessionToCwd(
  sourceSession: ForkableSessionManager,
  targetCwd: string,
  sessionDir?: string,
): string {
  const sourceSessionFile = sourceSession.getSessionFile();
  if (!sourceSessionFile) {
    throw new Error("Cannot change cwd for an ephemeral session");
  }

  if (!isUnmaterializedSessionFile(sourceSessionFile)) {
    return forkSessionToCwd(sourceSessionFile, targetCwd, sessionDir);
  }

  const sourceHeader = sourceSession.getHeader();
  if (!sourceHeader) {
    throw new Error("Cannot fork: current session has no header");
  }

  const forked = SessionManager.create(targetCwd, sessionDir, { parentSession: sourceSessionFile });
  const forkedFile = getForkedSessionFile(forked);
  const forkedHeader = forked.getHeader();
  if (!forkedHeader) {
    throw new Error("Failed to create forked session header for new cwd");
  }

  writeSessionFile(forkedFile, [forkedHeader, ...sourceSession.getEntries()]);
  return forkedFile;
}
