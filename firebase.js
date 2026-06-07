const firebaseConfig = {
  apiKey: "AIzaSyDAGDPQXw_7IXfd1y_AyBaxm6pvZt0jOWM",
  authDomain: "quinflo.firebaseapp.com",
  projectId: "quinflo",
  storageBucket: "quinflo.firebasestorage.app", // Configurado pero NO instanciado. Ver nota abajo.
  messagingSenderId: "662940889446",
  appId: "1:662940889446:web:1e52dfebd1680ec62318a7"
};
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// STORAGE: storageBucket está presente en firebaseConfig pero firebase.storage() NO se instancia.
// Adjuntos en documentos y otros activos binarios siguen pendientes de implementación.
// Instanciar únicamente cuando se implemente el módulo de adjuntos (sprint pendiente).
// const storage = firebase.storage(); // ← NO activar sin sprint aprobado
