import { SessionManager } from "@earendil-works/pi-coding-agent";

export function forkSessionToCwd(
  sourceSessionFile: string,
  targetCwd: string,
  sessionDir?: string,
): string {
  const forked = SessionManager.forkFrom(sourceSessionFile, targetCwd, sessionDir);
  const forkedFile = forked.getSessionFile();
  if (!forkedFile) {
    throw new Error("Failed to create forked session for new cwd");
  }
  return forkedFile;
}
