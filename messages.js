// --- MENSAJES -----------------------------------------------
var QR_DEFAULTS = [
  'Hola, por favor, ¿puedes ir tú a buscar a los niños mañana?',
  'Hola, te recuerdo que tiene hora al dentista el viernes. Gracias.',
  'Gracias por avisar.',
  'Quedamos así entonces, gracias.'
];
var _qrEditMode = false;
var _qrEditTemp = null;

function _getQR() {
  if (_qrEditTemp !== null) return _qrEditTemp;
  return (USERDATA && USERDATA.quickReplies && USERDATA.quickReplies.length)
    ? USERDATA.quickReplies.slice() : QR_DEFAULTS.slice();
}

function _collectQRInputs() {
  var el = $('quickReplies');
  if (!el) return [];
  return Array.prototype.map.call(el.querySelectorAll('.qr-edit-inp'), function(i) { return i.value; });
}

async function _saveQR(arr) {
  if (USERDATA) USERDATA.quickReplies = arr;
  try { await _supabase.from('users').update({ quick_replies: arr }).eq('id', USER.id); }
  catch(e) { console.error('[saveQR]', e); }
}

function renderQuickReplies() {
  var el = $('quickReplies');
  if (!el) return;
  el.innerHTML = '';

  if (_qrEditMode) {
    var replies = _getQR();
    var wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;margin-bottom:10px';
    replies.forEach(function(t, i) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:center';
      var inp = document.createElement('input');
      inp.className = 'inp qr-edit-inp';
      inp.value = t;
      inp.style.cssText = 'flex:1;font-size:12px;padding:7px 10px';
      inp.placeholder = 'Escribe una guía…';
      var del = document.createElement('button');
      del.className = 'exp-act-btn exp-act-danger';
      del.title = 'Eliminar';
      del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      del.addEventListener('click', function() {
        var cur = _collectQRInputs(); cur.splice(i, 1); _qrEditTemp = cur; renderQuickReplies();
      });
      row.appendChild(inp); row.appendChild(del); wrap.appendChild(row);
    });
    el.appendChild(wrap);

    var acts = document.createElement('div');
    acts.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';

    var addBtn = document.createElement('button');
    addBtn.className = 'btn-outline';
    addBtn.style.cssText = 'font-size:12px;padding:6px 12px';
    addBtn.textContent = '+ Agregar';
    addBtn.addEventListener('click', function() {
      var cur = _collectQRInputs(); cur.push(''); _qrEditTemp = cur; renderQuickReplies();
      setTimeout(function() {
        var inputs = $('quickReplies').querySelectorAll('.qr-edit-inp');
        if (inputs.length) inputs[inputs.length - 1].focus();
      }, 50);
    });

    var saveBtn = document.createElement('button');
    saveBtn.className = 'btn-sm';
    saveBtn.style.cssText = 'font-size:12px;padding:6px 14px';
    saveBtn.textContent = 'Guardar';
    saveBtn.addEventListener('click', async function() {
      var arr = _collectQRInputs().map(function(s) { return s.trim(); }).filter(Boolean);
      await _saveQR(arr);
      _qrEditMode = false; _qrEditTemp = null; renderQuickReplies();
    });

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-outline';
    cancelBtn.style.cssText = 'font-size:12px;padding:6px 12px';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', function() {
      _qrEditMode = false; _qrEditTemp = null; renderQuickReplies();
    });

    acts.appendChild(addBtn); acts.appendChild(saveBtn); acts.appendChild(cancelBtn);
    el.appendChild(acts);

  } else {
    _getQR().forEach(function(t) {
      var btn = document.createElement('button');
      btn.className = 'quick-reply-btn';
      btn.textContent = t;
      btn.addEventListener('click', function() { $('msgInput').value = t; });
      el.appendChild(btn);
    });
    var editLink = document.createElement('button');
    editLink.style.cssText = 'background:none;border:none;font-size:10px;color:var(--text-s);cursor:pointer;font-family:inherit;padding:4px 2px;width:100%;text-align:left;margin-top:4px;text-decoration:underline;text-underline-offset:3px;letter-spacing:.2px';
    editLink.textContent = 'Editar guías';
    editLink.addEventListener('click', function() { _qrEditMode = true; renderQuickReplies(); });
    el.appendChild(editLink);
  }
}

function isPotentiallyOffensive(txt) {
  var bad = ['idiota','imbécil','imbecil','estúpido','estupido','inútil','inutil','weon','hueon','mierda','conchetumadre','ctm','pendejo','descriteriado','irresponsable'];
  var t = txt.toLowerCase();
  return bad.some(function(w) { return t.indexOf(w) >= 0; });
}

async function sendMsg() {
  var txt = $('msgInput').value.trim();
  if (!txt) return;
  if (isPotentiallyOffensive(txt)) {
    var ok = confirm('Este mensaje podría interpretarse como ofensivo o poco colaborativo. ¿Quieres enviarlo igual?');
    if (!ok) return;
  }
  await _supabase.from('messages').insert({
    family_id: FAMILY_ID,
    content: txt,
    sender_name: USERDATA ? USERDATA.name : '',
    author_role: myRole(),
    author_id: USER.id,
    type: 'message'
  });
  $('msgInput').value = '';
}

async function sendMsgDivider() {
  await _supabase.from('messages').insert({
    family_id: FAMILY_ID,
    content: '',
    author_role: myRole(),
    author_id: USER.id,
    type: 'divider'
  });
}

function renderMessages() {
  var el = $('msgList');
  if (!el) return;
  if (!messages.length) { el.innerHTML = '<p style="text-align:center;color:var(--text-s);font-size:13px;margin:auto">Sin mensajes aún</p>'; return; }
  el.innerHTML = messages.map(function(m) {
    if (m.type === 'divider') return '<div class="msg-divider"></div>';
    var isMe = m.createdBy === (USER && USER.id);
    var time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    return '<div style="display:flex;justify-content:' + (isMe ? 'flex-end' : 'flex-start') + '"><div class="msg-bubble ' + (isMe ? 'me' : 'other') + '"><div class="msg-sender">' + (m.senderName || '') + '</div>' + (m.text || m.content || '') + '<div class="msg-time">' + time + '</div></div></div>';
  }).join('');
  el.scrollTop = el.scrollHeight;
}
