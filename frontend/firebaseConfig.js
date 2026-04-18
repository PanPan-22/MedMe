import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBaFbyVIjilKlUPOiHfZjdAOsP4QDM9pqA",
  authDomain: "medme-81a7f.firebaseapp.com",
  projectId: "medme-81a7f",
  storageBucket: "medme-81a7f.firebasestorage.app",
  messagingSenderId: "211693474262",
  appId: "1:211693474262:web:5916272b3b9e80a65dd477",
};

export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const firestore = getFirestore(firebaseApp);
