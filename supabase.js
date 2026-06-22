// ============================================================
// Supabase client — reemplaza firebase.js
// Configurar SUPABASE_URL y SUPABASE_ANON_KEY antes de deploy
// Obtener en: Supabase Dashboard → Settings → API
// ============================================================

const SUPABASE_URL      = 'https://xvfdncjrwrcbxgogzvym.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2ZmRuY2pyd3JjYnhnb2d6dnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNjU3MTgsImV4cCI6MjA5NzY0MTcxOH0.IhNZ-V8YPAAwbuo24HJw-k5BSAXtK2lDpHvWzJOcB7I';

const { createClient } = window.supabase;
const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken:    true,
    persistSession:      true,
    detectSessionInUrl:  true    // maneja redirect de OAuth (Google)
  }
});
