// --- ESTADO -------------------------------------------------
let USER = null, USERDATA = null, CODATA = null, FAMILY_ID = null;
let IS_REGISTERING = false;
let IS_ONBOARDING_ACTIVE = false;
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth();
let selDay = null, custodyMap = {}, calEventsMap = {}, custodyOverridesMap = {};
let calFilter = 'both';
let expenses = [], messages = [], children = [], agreements = [], reminders = [], proposals = [], events = [], documents = [], settlements = [], activityLog = [], temporaryOutings = [], custodyConfirmations = [];
let expPeriod = 'week', expCurrency = 'CLP', UF = 38650;
let expandedAgr = null;

// --- HELPERS DOM --------------------------------------------
const $ = id => document.getElementById(id);
const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');
const fmtCLP = n => '$' + Math.round(n).toLocaleString('es-CL');
const fmtUF = n => 'UF ' + parseFloat(n).toFixed(2).replace('.', ',');
const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const p1 = () => USERDATA && USERDATA.familyConfig ? USERDATA.familyConfig.p1Label : 'Mamá';
const p2 = () => USERDATA && USERDATA.familyConfig ? USERDATA.familyConfig.p2Label : 'Papá';
const myRole = () => USERDATA ? USERDATA.role : 'p1';
// Escapa texto libre antes de insertarlo en innerHTML (usado para respuestas
// de texto que otro usuario va a leer en Actividad reciente).
const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const myLabel = () => myRole() === 'p1' ? p1() : p2();

function showMsg(id, text, isError) {
  var el = $(id);
  el.textContent = text;
  el.className = isError ? 'msg-error' : 'msg-ok';
  el.classList.remove('hidden');
}
function hideMsg(id) { $(id).classList.add('hidden'); }

// --- SUPABASE HELPERS ---------------------------------------

// Convierte snake_case a camelCase en un objeto (compatible con código Firebase)
function toCamel(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(function([k, v]) {
      var ck = k.replace(/_([a-z])/g, function(_, l) { return l.toUpperCase(); });
      return [ck, v && typeof v === 'object' && !Array.isArray(v) ? toCamel(v) : v];
    })
  );
}

// Convierte array de filas Supabase a camelCase
const rowsToCamel = rows => (rows || []).map(toCamel);

// Query builder filtrado por familia (equivalente a famCol en Firebase)
// Solo para lectura — las escrituras van directo en cada módulo
const famQ = table => supa.from(table).eq('family_id', FAMILY_ID);

// NOW() del cliente como ISO string (Supabase acepta ISO en columnas timestamptz)
const nowISO = () => new Date().toISOString();

// --- ERRORES AUTH -------------------------------------------
function supaAuthErr(error) {
  if (!error) return 'Error inesperado. Intenta de nuevo.';
  var msg = (error.message || '').toLowerCase();
  if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) return 'El correo ya está registrado';
  if (msg.includes('invalid email')) return 'Correo inválido';
  if (msg.includes('password') && msg.includes('short')) return 'Mínimo 6 caracteres';
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials') || msg.includes('email not confirmed')) return 'Correo o contraseña incorrectos';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Demasiados intentos. Espera unos minutos.';
  if (msg.includes('popup') || msg.includes('blocked')) return 'El popup fue bloqueado. Permite popups para este sitio.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Error de conexión. Verifica tu internet.';
  return error.message || 'Error inesperado. Intenta de nuevo.';
}

// Alias para compatibilidad con código que usaba errMsg(e.code) de Firebase
const errMsg = (codeOrErr) => {
  if (typeof codeOrErr === 'string') {
    const AUTH_ERRORS = {
      'auth/user-not-found':     'No existe cuenta con ese correo',
      'auth/wrong-password':     'Contraseña incorrecta',
      'auth/email-already-in-use': 'El correo ya está registrado',
      'auth/weak-password':      'Mínimo 6 caracteres',
      'auth/invalid-email':      'Correo inválido',
      'auth/too-many-requests':  'Demasiados intentos. Espera unos minutos.',
      'auth/invalid-credential': 'Correo o contraseña incorrectos',
    };
    return AUTH_ERRORS[codeOrErr] || 'Error inesperado. Intenta de nuevo.';
  }
  return supaAuthErr(codeOrErr);
};
