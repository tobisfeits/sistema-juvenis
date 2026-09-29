// lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

// Singleton: garante uma única instância por sessão
let clienteGlobal: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (clienteGlobal) return clienteGlobal;

  clienteGlobal = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return clienteGlobal;
}