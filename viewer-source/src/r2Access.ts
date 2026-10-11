import { Resource } from "cesium";

export const PRIVATE_R2_ORIGIN = "https://lct-private-3d-viewer.private-3d-viewer.workers.dev";
export const TAOYUAN_R2_PROJECT = "taoyuan-20261006";
type Access = { project: string; token: string; expiresAt: number; role: "admin" | "viewer" };
export type SiteAuth = {
  login(password: string, role: "admin" | "viewer"): Promise<Access>;
  restore(force?: boolean): Promise<Access>;
  getAccess(project: string): Access | null;
  clear(): void;
};
declare global { interface Window { LCT_SITE_AUTH?: SiteAuth } }

export class R2AuthorizationRequired extends Error {
  constructor() { super("網站登入已過期，請重新登入網站後載入私人模型。"); }
}
export function hasR2Access(project: string): boolean {
  return !!window.LCT_SITE_AUTH?.getAccess(project);
}
export async function ensureR2Access(project = TAOYUAN_R2_PROJECT): Promise<void> {
  if (project !== TAOYUAN_R2_PROJECT) throw new Error("私人模型專案不允許。");
  if (!window.LCT_SITE_AUTH) throw new R2AuthorizationRequired();
  await window.LCT_SITE_AUTH.restore();
  if (!hasR2Access(project)) throw new R2AuthorizationRequired();
}
export function privateR2Resource(url: string, project: string): Resource {
  const auth = window.LCT_SITE_AUTH;
  const access = auth?.getAccess(project);
  if (!access || !auth) throw new R2AuthorizationRequired();
  const expected = `${PRIVATE_R2_ORIGIN}/projects/${encodeURIComponent(project)}/tiles/`;
  if (!url.startsWith(expected)) throw new Error("私人模型網址與授權專案不符。");
  return new Resource({
    url, headers: { Authorization: `Bearer ${access.token}` }, retryAttempts: 1,
    retryCallback: async (resource?: Resource, error?: { statusCode?: number }) => {
      if (!resource || error?.statusCode !== 401 || !resource.url.startsWith(expected)) return false;
      // Derived tile resources inherit this callback; renewal is shared across tiles.
      const current = auth.getAccess(project);
      if (!current || resource.headers.Authorization === `Bearer ${current.token}`) await auth.restore(true);
      const renewed = auth.getAccess(project);
      if (!renewed) return false;
      resource.headers.Authorization = `Bearer ${renewed.token}`;
      return true;
    }
  });
}
