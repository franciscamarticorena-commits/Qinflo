// Firebase Messaging Service Worker — maneja notificaciones push en background
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDAGDPQXw_7IXfd1y_AyBaxm6pvZt0jOWM",
  authDomain: "qinflo.cl",
  projectId: "quinflo",
  messagingSenderId: "662940889446",
  appId: "1:662940889446:web:1e52dfebd1680ec62318a7"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var n = payload.notification || {};
  self.registration.showNotification(n.title || 'Qinflo', {
    body: n.body || '',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-72.png',
    data: payload.data || {}
  });
});
