// --- ESTADO -------------------------------------------------
let USER = null, USERDATA = null, CODATA = null, FAMILY_ID = null;
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth();
let selDay = null, custodyMap = {}, calEventsMap = {};
let expenses = [], messages = [], children = [], agreements = [], reminders = [], proposals = [];
let expPeriod = 'week', expCurrency = 'CLP', UF = 38650;
let expandedAgr = null;

// --- HELPERS ------------------------------------------------
const $ = id => document.getElementById(id);
const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');
const fmtCLP = n => '$' + Math.round(n).toLocaleString('es-CL');
const fmtUF = n => 'UF ' + parseFloat(n).toFixed(2).replace('.', ',');
// FLUJO DE INVITACIONES: genCode() genera el código alfanumérico de 6 chars para el link de invitación.
// Se llama en showConnectScreen() cuando USERDATA.inviteCode no existe. No eliminar.
const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const p1 = () => USERDATA && USERDATA.familyConfig ? USERDATA.familyConfig.p1Label : 'Mamá';
const p2 = () => USERDATA && USERDATA.familyConfig ? USERDATA.familyConfig.p2Label : 'Papá';
const myRole = () => USERDATA ? USERDATA.role : 'p1';
const myLabel = () => myRole() === 'p1' ? p1() : p2();
const famCol = name => db.collection('families').doc(FAMILY_ID).collection(name);

function showMsg(id, text, isError) {
  var el = $(id);
  el.textContent = text;
  el.className = isError ? 'msg-error' : 'msg-ok';
  el.classList.remove('hidden');
}
function hideMsg(id) { $(id).classList.add('hidden'); }

const AUTH_ERRORS = {
  'auth/user-not-found': 'No existe cuenta con ese correo',
  'auth/wrong-password': 'Contraseña incorrecta',
  'auth/email-already-in-use': 'El correo ya está registrado',
  'auth/weak-password': 'Mínimo 6 caracteres',
  'auth/invalid-email': 'Correo inválido',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos'
};
const errMsg = code => AUTH_ERRORS[code] || 'Error inesperado. Intenta de nuevo.';
