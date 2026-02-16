// firestore_bridge.js
// ✅ Single stable bridge for pages (index/form/operation)
// - Keep APIs consistent across pages
// - Add listenMissionsByYear (client-filter fallback if DB doesn't support by-year query)

import {
  addEventAndUpdateMission,
  loadAllMissions as _loadAllMissions,
  listenMissions as _listenMissions,
  subscribeMissions48h as _subscribeMissions48h,
  // ถ้าอนาคตคุณเพิ่มใน firebase_db.js ก็เปิดใช้ได้เลย:
  // listenMissionsByYear as _listenMissionsByYear,
} from "./firebase_db.js";

function nowISO(){ return new Date().toISOString(); }

function toYYYYMMDD(d){
  if (!d) return new Date().toISOString().slice(0,10);
  const s = String(d);
  if (s.length >= 10 && s.includes("-")) return s.slice(0,10);
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? new Date().toISOString().slice(0,10)
    : dt.toISOString().slice(0,10);
}

function pickMissionDateISO(m){
  const candidates = [
    m?.missionDateISO, m?.dateISO, m?.date, m?.missionDate,
    m?.details?.missionDateISO, m?.details?.dateISO, m?.details?.date, m?.details?.missionDate
  ];
  for (const v of candidates){
    const s = String(v ?? "").trim();
    if (s && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  }
  return "";
}

function normalizeMissionId(m){
  const mm = m || {};
  const id = String(mm?.id || mm?.missionId || "").trim();
  if (!id) return mm;
  mm.id = id;
  mm.missionId = id;
  return mm;
}

/** CREATE from form */
export async function saveMission(missionId, missionObj){
  const mid = String(missionId || "").trim();
  if (!mid) throw new Error("saveMission: missing missionId");

  const missionDateISO = toYYYYMMDD(missionObj?.date || pickMissionDateISO(missionObj));
  const status = String(missionObj?.status || missionObj?.details?.status || "Scheduled");

  const patch = {
    missionId: mid,
    id: mid,

    // ✅ keep both fields for UI compat
    statusCurrent: status,
    status: status,

    // ✅ critical for year/day filters
    missionDateISO,

    // audit only (client)
    createdAtISO: nowISO(),

    details: missionObj?.details || {},
    typeKey: missionObj?.typeKey || "",
    type: missionObj?.type || "",
    typeDisplay: missionObj?.typeDisplay || "",
    vehicle: missionObj?.vehicle || "",
  };

  const ev = {
    eventType: "CREATE",
    by: (missionObj?.details?.createdBy || missionObj?.createdBy || ""),
    note: "Created from form",
    eventAtISO: nowISO(),
  };

  await addEventAndUpdateMission(mid, ev, patch);
  return true;
}

/** UPDATE / STATUS / CANCEL / STAMP */
export async function updateMission(missionId, eventType, by, note, patch){
  const mid = String(missionId || "").trim();
  if (!mid) throw new Error("updateMission: missing missionId");

  const ev = {
    eventType: String(eventType || "UPDATE"),
    by: String(by || ""),
    note: String(note || ""),
    eventAtISO: nowISO(),
  };

  // ✅ normalize id fields in patch if present
  const p = patch || {};
  if (typeof p === "object" && p){
    if (!p.id) p.id = mid;
    if (!p.missionId) p.missionId = mid;

    // ✅ if patch contains any date, maintain missionDateISO
    const md = pickMissionDateISO(p) || pickMissionDateISO(p?.details) || "";
    if (md && !p.missionDateISO) p.missionDateISO = md.slice(0,10);
  }

  await addEventAndUpdateMission(mid, ev, p);
  return true;
}

/** Load all missions once (non-realtime) */
export async function loadAllMissions(){
  const arr = await _loadAllMissions();
  return Array.isArray(arr) ? arr.map(normalizeMissionId) : [];
}

/** Realtime listen (all missions) */
export function listenMissions(onData, onError){
  return _listenMissions(
    (arr)=>{
      const out = Array.isArray(arr) ? arr.map(normalizeMissionId) : [];
      onData && onData(out);
    },
    onError
  );
}

/** Backward compat (some pages still import this) */
export function subscribeMissions48h(onData, onError){
  return _subscribeMissions48h(
    (arr)=>{
      const out = Array.isArray(arr) ? arr.map(normalizeMissionId) : [];
      onData && onData(out);
    },
    onError
  );
}

/**
 * ✅ NEW: listenMissionsByYear(year)
 * - ตอนนี้: ใช้ listener เดิม แล้ว filter ปีจาก missionDateISO (client side)
 * - อนาคต: ถ้า firebase_db.js มี query by-year จริง -> เปิดใช้ _listenMissionsByYear ได้เลย
 * - return: unsubscribe function
 */
export function listenMissionsByYear(year, onData, onError){
  const y = String(year || "").slice(0,4);
  if (!/^\d{4}$/.test(y)) throw new Error("listenMissionsByYear: invalid year");

  // (A) Future: if you implement in firebase_db.js
  // if (typeof _listenMissionsByYear === "function"){
  //   return _listenMissionsByYear(y, (arr)=>{
  //     const out = Array.isArray(arr) ? arr.map(normalizeMissionId) : [];
  //     onData && onData(out);
  //   }, onError);
  // }

  // (B) Now: fallback filter from all missions
  return _listenMissions(
    (arr)=>{
      const list = Array.isArray(arr) ? arr.map(normalizeMissionId) : [];
      const filtered = list.filter(m => {
        const d = pickMissionDateISO(m) || String(m?.missionDateISO || "");
        return d && String(d).slice(0,4) === y;
      });
      onData && onData(filtered);
    },
    onError
  );
}
