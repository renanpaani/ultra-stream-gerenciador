var firebaseConfig = {
    apiKey: "AIzaSyDb3_D6dMOKSB03iB-BFHmVIucYzQhCOfo",
    authDomain: "ultrastreamgerenciador.firebaseapp.com",
    projectId: "ultrastreamgerenciador",
    storageBucket: "ultrastreamgerenciador.firebasestorage.app",
    messagingSenderId: "515735356184",
    appId: "1:515735356184:web:1a65b1ecd749de934b546d",
    measurementId: "G-KSPQ9WSP0S"
};

// Initialize Firebase (Compat Mode)
// This works with the scripts loaded in index.html
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);

    // Expose services globally
    window.db = firebase.firestore();
    window.auth = firebase.auth();

    console.log("🔥 Firebase (Compat) Reconectado e Pronto!");
} else {
    console.error("❌ Firebase SDK não encontrado. Verifique o index.html");
}