// --- MENSAJES -----------------------------------------------
function renderQuickReplies() {
  var el = $('quickReplies');
  if (!el) return;
  el.innerHTML = '';
  [
    'Hola, por favor, ¿puedes ir tú a buscar a los niños mañana?',
    'Hola, te recuerdo que tiene hora al dentista el viernes. Gracias.',
    'Hola, ¿podrías por favor comprar tú la cartulina? Y lo registramos en gastos.',
    'Hola, te comento que mañana salen antes del colegio. ¿Cómo nos coordinamos?',
    'Gracias por avisar.',
    'Quedamos así entonces, gracias.'
  ].forEach(function(t) {
    var btn = document.createElement('button');
    btn.className = 'quick-reply-btn';
    btn.textContent = t;
    btn.addEventListener('click', function() { $('msgInput').value = t; });
    el.appendChild(btn);
  });
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
  await famCol('messages').add({
    text: txt, senderName: USERDATA ? USERDATA.name : '',
    senderRole: myRole(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: USER.uid
  });
  $('msgInput').value = '';
}

function renderMessages() {
  var el = $('msgList');
  if (!el) return;
  if (!messages.length) { el.innerHTML = '<p style="text-align:center;color:var(--text-s);font-size:13px;margin:auto">Sin mensajes aún</p>'; return; }
  el.innerHTML = messages.map(function(m) {
    var isMe = m.createdBy === (USER && USER.uid);
    var time = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    return '<div style="display:flex;justify-content:' + (isMe ? 'flex-end' : 'flex-start') + '"><div class="msg-bubble ' + (isMe ? 'me' : 'other') + '"><div class="msg-sender">' + (m.senderName || '') + '</div>' + m.text + '<div class="msg-time">' + time + '</div></div></div>';
  }).join('');
  el.scrollTop = el.scrollHeight;
}
