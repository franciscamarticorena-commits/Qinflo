// Supabase client — reemplaza firebase.js
// Reemplazar estas constantes con los valores reales del proyecto Supabase:
// Dashboard → Settings → API → Project URL y anon public key
var SUPABASE_URL      = 'https://YOUR_PROJECT_ID.supabase.co';
var SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

var _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});
