/**
 * Base URL for Supabase Storage public object URLs.
 *
 * Configured by VITE_SUPABASE_URL (required):
 *   - "https://<project>.supabase.co": load public assets straight from that project.
 *   - "" (set but empty): same-origin `/storage/v1/...` URLs, served through the Vite dev
 *     proxy (DEV_SUPABASE_PROXY_TARGET in vite.config.ts). Used by the local Supabase stack
 *     so assets also load through remote dev previews.
 *
 * Unset is a configuration error: there is deliberately no default project.
 */
export function getSupabaseStorageBaseUrl(): string {
  const url: string | undefined = import.meta.env.VITE_SUPABASE_URL;
  if (url === undefined) {
    throw new Error(
      'VITE_SUPABASE_URL is not set. Set it to your Supabase project URL, or to an empty value ' +
        'to use the dev-server storage proxy (see frontend/.env.example).'
    );
  }
  return url.replace(/\/+$/, '');
}
