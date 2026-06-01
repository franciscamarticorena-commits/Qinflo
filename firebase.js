const firebaseConfig = {
  apiKey: "AIzaSyDAGDPQxW_7IXfd1y_AyBxam6pvZtGjOWM",
  authDomain: "qinflo.firebaseapp.com",
  projectId: "qinflo",
  storageBucket: "qinflo.firebasestorage.app",
  messagingSenderId: "662940889446",
  appId: "1:662940889446:web:1e52dfebd1680ec62318a7"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
