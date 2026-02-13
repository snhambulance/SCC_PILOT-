// firestore_bridge.js
// Thin bridge for pages (index/form/operation) to call stable APIs.

import {
  addEventAndUpdateMission,
  loadAllMissions as _loadAllMissions,
  listenMissions as _listenMissions,
  subscribeMissions48h as _subscribeMissions48h,
} from "./firebase_db.js";

function nowISO(){ return new Date().toISOString(); }
function toYYYYMMDD(d){
  if (!d) return new Date().toISOString().slice(0,10);
  const s = String(d);
  if (s.length >= 10 && s.includes("-")) return s.slice(0,10);
  return new Date(d).toISOString().slice(0,10);
}

/** CREATE from form */
export async function saveMission(missionId, missionObj){
  const missionDateISO = toYYYYMMDD(missionObj?.date);

  const patch = {
    missionId: String(missionId),
    id: String(missionId),
    statusCurrent: String(missionObj?.status || "Scheduled"),
    missionDateISO,
    createdAtISO: nowISO(),     // audit only (client)
    details: missionObj?.details || {},
    typeKey: missionObj?.typeKey || "",
    type: missionObj?.type || "",
    typeDisplay: missionObj?.typeDisplay || "",
    vehicle: missionObj?.vehicle || "",
    // keep a top-level status too if you want compatibility with old UI
    status: String(missionObj?.status || "Scheduled"),
  };

  const ev = {
    eventType: "CREATE",
    by: (missionObj?.details?.createdBy || missionObj?.createdBy || ""),
    note: "Created from form",
    eventAtISO: nowISO(),
  };

  await addEventAndUpdateMission(missionId, ev, patch);
}

/** UPDATE / STATUS / CANCEL / STAMP */
export async function updateMission(missionId, eventType, by, note, patch){
  const ev = {
    eventType: String(eventType || "UPDATE"),
    by: String(by || ""),
    note: String(note || ""),
    eventAtISO: nowISO(),
  };
  await addEventAndUpdateMission(missionId, ev, patch || {});
}

/** ✅ Load all missions once (non-realtime) */
export async function loadAllMissions(){
  return await _loadAllMissions();
}

/** ✅ Realtime listen */
export function listenMissions(onData, onError){
  return _listenMissions(onData, onError);
}

/** ✅ Backward compat (some pages still import this) */
export function subscribeMissions48h(onData, onError){
  return _subscribeMissions48h(onData, onError);
}
