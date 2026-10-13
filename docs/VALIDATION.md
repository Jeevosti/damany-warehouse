# Delivery verification — login update (version 2.1)

Validated on 13 October 2026.

- Production build: TypeScript and Vite passed.
- 30 application tests passed, including 13 new authentication checks: sign-in failure, restoration verification, stale-session/logout race, account cache isolation, recovery session handling, reset destination, password validation, and an initial-render check proving the business app and queries do not mount before authentication.
- Read-only checks on the configured Supabase project confirm RLS with account ownership on all seven Solara tables, no anonymous SELECT/INSERT access, and no anonymous execution of the six business API functions.
- No database schema, accounts, passwords, or business records were changed.
- The updated source package includes the login implementation, authentication tests, and Netlify build configuration.

Limits: No real user's credentials were requested or used. Real email delivery, a successful user sign-in, and the complete email reset round trip were not exercised. Browser automation was unavailable; responsive layout was implemented in CSS but not screenshot-tested. Supabase Auth must allowlist the deployed password recovery URL. A separate Netlify deployment still requires redeploying the updated code with that deployment's Supabase settings. This checkout retains its original configured Supabase project unless changed with environment variables or the app's Connection settings.

---

# Delivery verification — version 2

Validated on 12 October 2026.

## Passed

- Strict TypeScript compilation and Vite production bundling.
- 17 application checks: month-end/leap-year arithmetic, expiry boundaries, metrics, CSV neutralization, demo transactions, fault quarantine, replacement chains, migration preservation, and notification read state.
- 22 baseline PostgreSQL checks and 35 populated v1-to-v2 migration/RMA checks on PGlite, using the actual SQL migrations with a mocked auth helper.
- Both migrations applied successfully to Supabase project `dgxuaibxpujbugjabreo` (Jeevosti's Project). No existing POS tables were modified, and no demo/sample business records were inserted into the live workspace.
- Live schema checks confirm the workspace snapshot includes all seven data collections; RLS and permissions were checked after deployment of the migration.
- The Supabase security advisor reported no findings for the new solar-management tables or functions.

## Verification limits

- No user password was requested or used. An actual end-user Auth sign-in/browser round trip was not exercised in this session.
- Browser automation was unavailable in the managed build environment. Screenshot and interactive browser QA were not performed.
- Database tests exercise rollback and uniqueness, but do not simulate a multi-connection load test. PostgreSQL row locks, physical-unit uniqueness, and transaction boundaries govern concurrent allocation.

## Existing project advisory findings

The advisor also reports pre-existing findings outside this system: 12 `pos_…` tables use RLS without policies, existing POS/security-definer functions are exposed, and project-level leaked-password protection is disabled. These objects/settings were not changed because they belong to existing applications. Review their intended RPC-only access design before changing permissions.

Remediation references:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

The app's project URL and publishable key are public client configuration. Supabase Auth and account RLS protect records; the source contains no service-role key or database password.
