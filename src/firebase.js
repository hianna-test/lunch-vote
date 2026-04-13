import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyAzjOPcZcZoh8cSt9xbU499oV3Sf5JPab8",
  authDomain: "googoo-86f29.firebaseapp.com",
  databaseURL: "https://googoo-86f29-default-rtdb.firebaseio.com",
  projectId: "googoo-86f29",
  storageBucket: "googoo-86f29.firebasestorage.app",
  messagingSenderId: "288903064018",
  appId: "1:288903064018:web:f9d5dccec39352702e000b"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
