// ════════════════════════════════════════════════════════════
//  วิธีใช้:
//  1. ไปที่ https://console.firebase.google.com
//  2. สร้าง project → Add app → Web (</>)
//  3. Copy config แล้ว paste แทน PASTE_HERE ด้านล่าง
// ════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBLTB9rvtPOzWtBaB9BfpNmntC6TCDnFE4",
  authDomain:        "mocha-feeder.firebaseapp.com",
  projectId:         "mocha-feeder",
  storageBucket:     "mocha-feeder.firebasestorage.app",
  messagingSenderId: "587144144533",
  appId:             "1:587144144533:web:ac757a2ce148b048581d9c",
};

// ── Init ─────────────────────────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();

// เปิด offline cache — ใช้ได้แม้ไม่มีเน็ต แล้ว sync ตอนกลับออนไลน์
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

console.log('🔥 Firebase connected:', FIREBASE_CONFIG.projectId);
