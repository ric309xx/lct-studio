# Website viewer credential cutover — staged, not deployed

2026-11-20: the website viewer password must authorize only
`taoyuan-20261006`. Longdong mesh login must use the distinct
`SITE_LONGDONG_SERVICE_PASSWORD_HASH` service credential or a website
administrator. A website administrator can still open either approved project.

The source and synthetic regression tests implement this boundary. They do not
change the live Cloudflare Worker or its secrets. The existing live compatibility
deployment intentionally retains its previous website-viewer behavior until the
production cutover is approved.

Before applying this change:

1. Confirm the active Worker version and preserve a rollback copy. The last
   verified version is `c2ba93ab-be30-4fd8-8075-8b856289fef3`.
2. Set distinct website viewer and Longdong service credentials. The ignored
   local release draft was corrected; the live secrets were not rotated.
3. Choose the Worker deployment scope explicitly. The repository Worker also
   requires `LOGIN_RATE_LIMITER`; the live minimal compatibility Worker does not
   have that binding. Do not deploy the entire source without planning the binding.
4. Coordinate Worker credentials with Netlify production values and a new
   production build. Verify both Taoyuan and Longdong through normal share login,
   project isolation, refresh and logout. Keep previous ion credentials until the
   new production site passes acceptance.

Node regression results: 77/77 for the repository security and Worker suites;
32/32 for the one-condition compiled candidate prepared from the exact live
compatibility source. These offline results do not prove a live Worker deployment.

Do not mark `integrationVerified` true or publish a production deploy solely on
the strength of these tests.
