// --- FIREBASE -----------------------------------------------
// Mantiene el proyecto Firebase actual para no romper producción.
// Cuando exista un proyecto Firebase nuevo para Qinflo, reemplazar aquí la configuración.
firebase.initializeApp({
  apiKey: "AIzaSyCPNF2HQ2x23Pbo2rAqBCkcqddSm7-BJkk",
  authDomain: "kindflo-copadres.firebaseapp.com",
  projectId: "kindflo-copadres",
  storageBucket: "kindflo-copadres.firebasestorage.app",
  messagingSenderId: "442877008580",
  appId: "1:442877008580:web:2dfb169fb0e754be824791"
});
const auth = firebase.auth();
const db = firebase.firestore();
