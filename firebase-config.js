// Firebase Configuration Obfuscated (Bot Prevention for GitHub)
const _conf = [
    "QUl6YVN5RGIzX0Q2ZE1PS1NCMDNpQi1CRkhtVkl1Y1l6UWhDT2Zv", // apiKey
    "dWx0cmFzdHJlYW1nZXJlbmNpYWRvci5maXJlYmFzYXBwLmNvbQ==", // authDomain
    "dWx0cmFzdHJlYW1nZXJlbmNpYWRvcg==",                   // projectId
    "dWx0cmFzdHJlYW1nZXJlbmNpYWRvci5maXJlYmFzZXN0b3JhZ2UuYXBw", // storageBucket
    "NTE1NzM1MzU2MTg0",                                  // messagingSenderId
    "MTo1MTU3MzUzNTYxODQ6d2ViOjFhNjViMWVjZDc0OWRlOTM0YjU0NmQ=", // appId
    "Ry1LU1BROVdTUDBT"                                   // measurementId
];

var firebaseConfig = {
    apiKey: atob(_conf[0]),
    authDomain: atob(_conf[1]),
    projectId: atob(_conf[2]),
    storageBucket: atob(_conf[3]),
    messagingSenderId: atob(_conf[4]),
    appId: atob(_conf[5]),
    measurementId: atob(_conf[6])
};

// Initialize Firebase (Compat Mode)
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    window.db = firebase.firestore();
    window.auth = firebase.auth();
    console.log("🔥 UltraStreamG: Conectado via GitHub Safe Link");
} else {
    console.error("❌ Erro de Carregamento Firebase");
}