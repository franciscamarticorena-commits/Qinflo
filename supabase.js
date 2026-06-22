// ============================================================
// Supabase client — reemplaza firebase.js
// Configurar SUPABASE_URL y SUPABASE_ANON_KEY antes de deploy
// Obtener en: Supabase Dashboard → Settings → API
// ============================================================

const SUPABASE_URL      = 'https://xvfdncjrwrcbxgogzvym.supabase.co';
const SUPABASE_ANON_KEY = 'SUPABASE_ANON_KEY_PENDIENTE';

const { createClient } = window.supabase;
const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken:    true,
    persistSession:      true,
    detectSessionInUrl:  true    // maneja redirect de OAuth (Google)
  }
});
