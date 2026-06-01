// --- CONNECT ------------------------------------------------
function showConnectScreen() {
  hide('authScreen'); hide('app'); show('connectScreen');
  if (USERDATA && USERDATA.inviteCode) {
    var baseUrl = window.location.origin + window.location.pathname.replace(/index\.html$/, '');
    var link = baseUrl + '?invite=' + USERDATA.inviteCode;
    $('inviteLinkDisplay').textContent = link;
    $('whatsappBtn').onclick = function() {
      var msg = encodeURIComponent('Hola! Te invito a conectarte en Qinflo para coordinar mejor los temas de nuestros hijos. Entra aqui: ' + link);
      window.open('https://wa.me/?text=' + msg, '_blank');
    };
  }
}

async function autoConnect(code) {
  try {
    var snap = await db.collection('users').where('inviteCode', '==', code).get();
    if (snap.empty) { loadApp(); return; }
    var otherDoc = snap.docs[0];
    var otherId = otherDoc.id;
    if (otherId === USER.uid) { loadApp(); return; }
    var otherData = otherDoc.data();
    var famId = (USERDATA && USERDATA.familyId) || otherData.familyId;
    var batch = db.batch();
    batch.update(db.collection('users').doc(USER.uid), { coparentId: otherId, familyId: famId });
    batch.update(db.collection('users').doc(otherId), { coparentId: USER.uid, familyId: famId });
    if (famId) {
      batch.update(db.collection('families').doc(famId), {
        members: firebase.firestore.FieldValue.arrayUnion(USER.uid, otherId)
      });
    }
    await batch.commit();
    window.history.replaceState({}, '', './');
    loadApp();
  } catch(e) {
    loadApp();
  }
}
