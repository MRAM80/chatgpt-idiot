# BR Garden Center Sync Check

Verify that everything working in SimpliiTrash also works correctly for BR Garden Center.

## Steps

1. **Environment variables** — check `.env.local` (if it exists) or note which env vars are needed:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_CLIENT_ICON_PREFIX`

2. **Ticket number prefix** — grep all `.tsx`/`.ts` files for `generateTicketNumber`. Confirm it uses `ST-` prefix. Note: BR Garden Center may need a different prefix (e.g. `BR-`). Flag this for the user to decide.

3. **Rodrigo driver account** — remind the user of the pending BR setup:
   - Create Rodrigo in Supabase Auth UI for the BR project
   - Run: `UPDATE drivers SET auth_user_id = '<new-auth-id>' WHERE name = 'Rodrigo';`
   - Run: `INSERT INTO user_profiles (auth_user_id, role, full_name) VALUES ('<new-auth-id>', 'driver', 'Rodrigo');`

4. **Storage RLS** — remind the user to add INSERT/SELECT policies on the `delivery-photos` bucket in the BR Supabase project.

5. **Pending SQL** — print the full SQL migration block from CLAUDE.md and remind the user it must be run in the BR project too.

Report as a checklist. Do not make code changes.
