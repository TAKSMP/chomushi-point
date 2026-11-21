import { DemoRepo } from './demoRepo';
import type { Repo } from './repo';
import { SupabaseRepo } from './supabaseRepo';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Publishable (anon) key: public by design, access is enforced by RLS in the database.
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
const demo = import.meta.env.VITE_DEMO_MODE === 'true';

export const backendConfigured = Boolean(url && key);

export function createRepo(): Repo | null {
  if (url && key) return new SupabaseRepo(url, key);
  if (demo) return new DemoRepo();
  return null;
}
