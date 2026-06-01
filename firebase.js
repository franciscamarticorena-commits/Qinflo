const firebaseConfig = {
  apiKey: "....",
  authDomain: "qinflo.firebaseapp.com",
  projectId: "qinflo",
  storageBucket: "qinflo.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
