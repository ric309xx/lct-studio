declare global {
  interface Window { LCT_VIEWER_ACCESS?: { role: "admin" | "viewer" } }
}

/** Sharing must never inherit an administrator's session/UI. */
export function isSharedViewerEntry(pathname: string, entryRole?: string): boolean {
  return entryRole === "viewer" || /^\/3d-viewer\/(?:p|c)\//.test(pathname);
}
