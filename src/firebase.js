// src/firebase.js
// Firebase クライアント SDK の初期化
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Firebase プロジェクトの設定値
const firebaseConfig = {
  apiKey:            "AIzaSyARw6Gf_s56bQd6HhPnoOl6y58QTRm716s",
  authDomain:        "aqua-shitumon.firebaseapp.com",
  projectId:         "aqua-shitumon",
  storageBucket:     "aqua-shitumon.firebasestorage.app",
  messagingSenderId: "983478802486",
  appId:             "1:983478802486:web:c9c4043ab1862ca943a097",
  measurementId:     "G-CD2RZY7PYZ"
};

// Web Push 用 VAPID 公開鍵
export const VAPID_KEY = "BEMmMznggL_geY668zogdssbLSD7-ofW34TrpClleOcR5HzaJiCkUPT0ctBtY5TBvuep5Sb2eUy544DvH7iOH7w";

// Firebase アプリの初期化
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);
