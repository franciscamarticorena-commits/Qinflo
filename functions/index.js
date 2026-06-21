'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// Get the FCM token of the OTHER family member (not the actor)
async function getOtherMemberToken(famId, actorUid) {
  const [famSnap] = await Promise.all([
    db.collection('families').doc(famId).get()
  ]);
  if (!famSnap.exists) return null;
  const members = famSnap.data().members || [];
  const recipientUid = members.find(uid => uid !== actorUid);
  if (!recipientUid) return null;
  const userSnap = await db.collection('users').doc(recipientUid).get();
  if (!userSnap.exists) return null;
  return userSnap.data().fcmToken || null;
}

async function sendPush(token, title, body) {
  if (!token) return;
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      webpush: {
        notification: { icon: 'https://qinflo.cl/assets/icons/icon-192.png' },
        fcmOptions: { link: 'https://qinflo.cl' }
      }
    });
  } catch (e) {
    // Expired or invalid token — ignore silently
    if (e.code !== 'messaging/registration-token-not-registered' &&
        e.code !== 'messaging/invalid-registration-token') {
      console.error('[sendPush]', e.code, e.message);
    }
  }
}

// 1. Nuevo mensaje
exports.onNewMessage = functions.firestore
  .document('families/{famId}/messages/{msgId}')
  .onCreate(async (snap, context) => {
    const msg = snap.data();
    if (msg.type === 'divider' || !msg.text) return null;
    const token = await getOtherMemberToken(context.params.famId, msg.createdBy);
    const name = msg.senderName ? msg.senderName.split(' ')[0] : 'Tu coparent';
    await sendPush(token, name, msg.text.slice(0, 120));
    return null;
  });

// 2. Nueva solicitud de cambio de custodia
exports.onNewProposal = functions.firestore
  .document('families/{famId}/proposals/{propId}')
  .onCreate(async (snap, context) => {
    const prop = snap.data();
    if (prop.status !== 'pending') return null;
    const token = await getOtherMemberToken(context.params.famId, prop.createdBy);
    const name = prop.createdByName ? prop.createdByName.split(' ')[0] : 'Tu coparent';
    const body = prop.reason ? prop.reason.slice(0, 100) : 'Revisa la solicitud en Qinflo';
    await sendPush(token, name + ' solicita un cambio de custodia', body);
    return null;
  });

// 3. Nuevo evento que requiere aprobación
exports.onNewEvent = functions.firestore
  .document('families/{famId}/events/{eventId}')
  .onCreate(async (snap, context) => {
    const ev = snap.data();
    if (!ev.requiresApproval || ev.approvalStatus !== 'pending') return null;
    const token = await getOtherMemberToken(context.params.famId, ev.createdBy);
    const title = (ev.title || 'Evento') + (ev.date ? ' · ' + ev.date : '');
    await sendPush(token, 'Evento pendiente de confirmación', title);
    return null;
  });
