// ════════════════════════════════════════════════════════════
//  วิธีใช้:
//  1. ไปที่ https://console.firebase.google.com
//  2. สร้าง project → Add app → Web (</>)
//  3. Copy config แล้ว paste แทน PASTE_HERE ด้านล่าง
// ════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey:            "PASTE_HERE",
  authDomain:        "PASTE_HERE",
  projectId:         "PASTE_HERE",
  storageBucket:     "PASTE_HERE",
  messagingSenderId: "PASTE_HERE",
  appId:             "PASTE_HERE",
};

// ── Init ─────────────────────────────────────────────────────
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();

// เปิด offline cache — ใช้ได้แม้ไม่มีเน็ต แล้ว sync ตอนกลับออนไลน์
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

console.log('🔥 Firebase connected:', FIREBASE_CONFIG.projectId);
