// --- ESTADO -------------------------------------------------
let USER = null, USERDATA = null, CODATA = null, FAMILY_ID = null;
let IS_REGISTERING = false;
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth();
let selDay = null, custodyMap = {}, calEventsMap = {}, custodyOverridesMap = {};
let calFilter = 'both';
let expenses = [], messages = [], children = [], agreements = [], reminders = [], proposals = [], events = [], documents = [], settlements = [], activityLog = [];
let expPeriod = 'week', expCurrency = 'CLP', UF = 38650;
let expandedAgr = null;

// --- HELPERS ------------------------------------------------
const $ = id => document.getElementById(id);
const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');
const fmtCLP = n => '$' + Math.round(n).toLocaleString('es-CL');
const fmtUF = n => 'UF ' + parseFloat(n).toFixed(2).replace('.', ',');
// FLUJO DE INVITACIONES: genCode() genera el código alfanumérico de 6 chars para el link de invitación.
const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const p1 = () => USERDATA && USERDATA.familyConfig ? USERDATA.familyConfig.p1Label : 'Mamá';
const p2 = () => USERDATA && USERDATA.familyConfig ? USERDATA.familyConfig.p2Label : 'Papá';
const myRole = () => USERDATA ? USERDATA.role : 'p1';
const myLabel = () => myRole() === 'p1' ? p1() : p2();

// Convierte snake_case a camelCase (respuestas PostgreSQL → JS)
function toCamel(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toCamel);
  var out = {};
  Object.keys(obj).forEach(function(k) {
    var ck = k.replace(/_([a-z])/g, function(_, c) { return c.toUpperCase(); });
    out[ck] = toCamel(obj[k]);
  });
  return out;
}
function mapRows(rows) { return (rows || []).map(toCamel); }

// Normaliza timestamps: acepta ISO string (Supabase) o Firestore Timestamp
function toDate(val) {
  if (!val) return null;
  if (val && typeof val.toDate === 'function') return val.toDate();
  return new Date(val);
}

function showMsg(id, text, isError) {
  var el = $(id);
  el.textContent = text;
  el.className = isError ? 'msg-error' : 'msg-ok';
  el.classList.remove('hidden');
}
function hideMsg(id) { $(id).classList.add('hidden'); }

const AUTH_ERRORS = {
  'invalid_credentials': 'Correo o contraseña incorrectos',
  'user_not_found': 'No existe cuenta con ese correo',
  'email_address_invalid': 'Correo inválido',
  'email_already_exists': 'El correo ya está registrado',
  'weak_password': 'Mínimo 6 caracteres',
  'over_request_rate_limit': 'Demasiados intentos. Espera unos minutos.',
  'user_banned': 'Cuenta suspendida.',
  // Supabase devuelve mensajes en texto, no códigos. Se usa como fallback.
  'Invalid login credentials': 'Correo o contraseña incorrectos',
  'Email not confirmed': 'Confirma tu correo antes de ingresar.',
  'User already registered': 'El correo ya está registrado',
  'Password should be at least 6 characters': 'Mínimo 6 caracteres'
};
function errMsg(codeOrMsg) {
  if (!codeOrMsg) return 'Error inesperado. Intenta de nuevo.';
  return AUTH_ERRORS[codeOrMsg] || AUTH_ERRORS[String(codeOrMsg).split(':')[0].trim()] || 'Error inesperado. Intenta de nuevo.';
}
