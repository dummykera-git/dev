import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
const firebaseConfig = {
  apiKey: "AIzaSyAY0eJ0iAVxP2tn2RLe7wVNB8Q15Vnjd-g",
  authDomain: "cmb-40001.firebaseapp.com",
  projectId: "cmb-40001",
  storageBucket: "cmb-40001.firebasestorage.app",
  messagingSenderId: "294144253040",
  appId: "1:294144253040:web:852b7c378ee8049f4268b5",
  measurementId: "G-RX05KNR8Y3"
};
export const firebaseReady = Boolean(config.apiKey && config.projectId && config.appId);
const app = getApps().length ? getApps()[0] : initializeApp(firebaseReady ? config : {apiKey:'demo', projectId:'demo'});
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
