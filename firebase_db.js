// firebase_db.js  (SOURCE OF TRUTH: Firestore)
// Exports (stable):
// - addEventAndUpdateMission(missionId, ev, patch)
// - setMissionPatch(missionId, patch)
// - saveMission(missionId, missionObj)      ✅ NEW (compat)
// - deleteMission(missionId)
// - deleteAllMissions()
// - getMission(missionId)
// - loadAllMissions()                       ✅ NEW
// - listenMissions(onData, onError)
// - subscribeMissions48h(onData, onError)   // backward-compat

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  initializeFirestore,   // ✅ เพิ่ม
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";


/* 🔧 YOUR CONFIG */
const firebaseConfig = {
  apiKey: "AIzaSyC2CZWT1jDRIs2th7x8pXI9m3Gkw8bNqVg",
  authDomain: "pilot-scc.firebaseapp.com",
  projectId: "pilot-scc",
  storageBucket: "pilot-scc.firebasestorage.app",
  messagingSenderId: "656652367033",
  appId: "1:656652367033:web:25a53cd3c979fea69ad768",
  measurementId: "G-LKWPRR2MVY",
};

const app = initializeApp(firebaseConfig);

// ✅ FIX: Force Long Polling
// แก้ปัญหา Firestore Listen 404 / 400
// โดยเฉพาะ LINE webview / hospital proxy / restrictive network
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});


/* ========= utils ========= */
function cleanUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function toYYYYMMDD(d) {
  // Accept: "YYYY-MM-DD", Date, ISO string, timestamp-like
  if (!d) return new Date().toISOString().slice(0, 10);

  const s = String(d);
  if (s.length >= 10 && s.includes("-")) return s.slice(0, 10);

  const dt = new Date(d);
  if (isNaN(dt.getTime())) return new Date().toISOString().slice(0, 10);

  return dt.toISOString().slice(0, 10);
}

/* ========= writes ========= */

/** ✅ Add timeline event + merge patch into mission doc */
export async function addEventAndUpdateMission(missionId, ev, patch) {
  const id = String(missionId || "").trim();
  if (!id) throw new Error("missionId missing");

  // 1) write event (audit trail)
  const eventsRef = collection(db, "missions", id, "events");
  await addDoc(
    eventsRef,
    cleanUndefined({
      ...(ev || {}),
      missionId: id,
      eventAt: serverTimestamp(),
    })
  );

  // 2) merge patch into mission doc
  const missionRef = doc(db, "missions", id);
  const missionDateISO = toYYYYMMDD(patch?.missionDateISO || patch?.date);

  const merged = cleanUndefined({
    ...cleanUndefined(patch || {}),
    missionId: id,
    id: id,
    missionDateISO,
    updatedAt: serverTimestamp(),
    lastEventAt: serverTimestamp(),

    // NOTE:
    // createdAt should ideally be set ONLY at creation time.
    // Keeping it here is okay for now, but it will update if called again.
    // If you want "true createdAt", remove this line later.
    createdAt: serverTimestamp(),
  });

  await setDoc(missionRef, merged, { merge: true });
}

/** ✅ Simple patch without event */
export async function setMissionPatch(missionId, patch) {
  const id = String(missionId || "").trim();
  if (!id) throw new Error("missionId missing");

  const missionRef = doc(db, "missions", id);
  await setDoc(
    missionRef,
    cleanUndefined({
      ...cleanUndefined(patch || {}),
      missionId: id,
      id: id,
      updatedAt: serverTimestamp(),
      lastEventAt: serverTimestamp(),
    }),
    { merge: true }
  );
}

/** ✅ NEW: Save full mission object (compat for operation_line.html imports) */
export async function saveMission(missionId, missionObj) {
  const id = String(missionId || missionObj?.id || "").trim();
  if (!id) throw new Error("missionId missing");

  const missionRef = doc(db, "missions", id);
  const missionDateISO = toYYYYMMDD(missionObj?.missionDateISO || missionObj?.date);

  await setDoc(
    missionRef,
    cleanUndefined({
      ...cleanUndefined(missionObj || {}),
      missionId: id,
      id: id,
      missionDateISO,
      updatedAt: serverTimestamp(),
      lastEventAt: serverTimestamp(),
    }),
    { merge: true }
  );

  return true;
}

/** ✅ Delete mission doc (events subcollection remains unless backend cleanup) */
export async function deleteMission(missionId) {
  const id = String(missionId || "").trim();
  if (!id) throw new Error("missionId missing");
  await deleteDoc(doc(db, "missions", id));
}

/**
 * ✅ Delete ALL mission docs in "missions"
 * - Does NOT delete subcollections (events) (Firestore limitation on client)
 */
export async function deleteAllMissions() {
  const snap = await getDocs(collection(db, "missions"));
  const promises = [];
  snap.forEach((docSnap) => {
    promises.push(deleteDoc(doc(db, "missions", docSnap.id)));
  });
  await Promise.all(promises);
}

/* ========= reads ========= */

/** ✅ Read one mission once */
export async function getMission(missionId) {
  const id = String(missionId || "").trim();
  if (!id) throw new Error("missionId missing");
  const snap = await getDoc(doc(db, "missions", id));
  return snap.exists() ? snap.data() : null;
}

/** ✅ NEW: Load all missions once (non-realtime) */
export async function loadAllMissions() {
  const snap = await getDocs(collection(db, "missions"));
  const arr = [];
  snap.forEach((docSnap) => arr.push(docSnap.data()));
  return arr;
}

/* ========= listeners ========= */

/** ✅ Realtime listener for missions (safe + simple) */
export function listenMissions(onData, onError) {
  const q = query(collection(db, "missions"), limit(800));
  return onSnapshot(
    q,
    (qs) => {
      const arr = [];
      qs.forEach((docSnap) => arr.push(docSnap.data()));

      // sort client-side (lastEventAt desc, fallback updatedAt/createdAt)
      arr.sort((a, b) => {
        const ta =
          a?.lastEventAt?.toMillis?.() ??
          a?.updatedAt?.toMillis?.() ??
          a?.createdAt?.toMillis?.() ??
          0;
        const tb =
          b?.lastEventAt?.toMillis?.() ??
          b?.updatedAt?.toMillis?.() ??
          b?.createdAt?.toMillis?.() ??
          0;
        return tb - ta;
      });

      if (typeof onData === "function") onData(arr);
    },
    (err) => {
      if (typeof onError === "function") onError(err);
      else console.error(err);
    }
  );
}

/** ✅ Backward compat */
export function subscribeMissions48h(onData, onError) {
  return listenMissions(onData, onError);
}
