export type Equipment = {
  id: string;
  name: string;
  board: string;
  length: string;
  boots: string;
  bindings: string;
  front: string;
  rear: string;
  width: string;
};
export type Practice = {
  cardId: string;
  skillId: string;
  status: string;
  custom?: string;
};
export type Entry = {
  id: string;
  date: string;
  resort: string;
  snow: string;
  terrain: string;
  energy: string;
  confidence: string;
  goals: string[];
  practices: Practice[];
  equipment: Equipment | null;
  minutes: string;
  learned: string;
  best: string;
  problem: string;
  next: string;
  coach: string;
  body: string;
  video: string;
  gearFeel: string;
};
export type Assessment = {
  state: string;
  terrain: string;
  snow: string;
  note: string;
  history: { date: string; state: string; note: string }[];
};
export type Data = {
  version: 1;
  profile: { nickname: string; years: string; stance: string; focus: string };
  season: {
    name: string;
    start: string;
    end: string;
    goals: { text: string; skillId: string }[];
  };
  entries: Entry[];
  draft: Entry | null;
  equipment: Equipment[];
  customSkills: {
    id: string;
    name: string;
    group: string;
    description: string;
    prereq: string;
  }[];
  assessments: Record<string, Assessment>;
  settings: { large: boolean; lastExport: string | null; exportCount: number };
};
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const uid = () => crypto.randomUUID();
export function initial(): Data {
  const y = new Date().getFullYear(),
    start = new Date().getMonth() < 6 ? y - 1 : y;
  return {
    version: 1,
    profile: { nickname: "", years: "", stance: "Regular", focus: "" },
    season: {
      name: `${start} / ${start + 1} 雪季`,
      start: `${start}-10-01`,
      end: `${start + 1}-06-30`,
      goals: [],
    },
    entries: [],
    draft: null,
    equipment: [],
    customSkills: [],
    assessments: {},
    settings: { large: false, lastExport: null, exportCount: 0 },
  };
}
export function newEntry(): Entry {
  return {
    id: uid(),
    date: today(),
    resort: "",
    snow: "压雪",
    terrain: "初级缓坡",
    energy: "充足",
    confidence: "平稳",
    goals: [],
    practices: [],
    equipment: null,
    minutes: "",
    learned: "",
    best: "",
    problem: "",
    next: "",
    coach: "",
    body: "",
    video: "",
    gearFeel: "",
  };
}
export function seasonEntries(d: Data) {
  return d.entries.filter(
    (e) => e.date >= d.season.start && e.date <= d.season.end,
  );
}
export function stats(d: Data) {
  const es = seasonEntries(d);
  return {
    days: new Set(es.map((e) => e.date)).size,
    minutes: es.reduce((n, e) => n + (Number(e.minutes) || 0), 0),
    resorts: [...new Set(es.map((e) => e.resort))],
    counts: Object.fromEntries(
      [
        ...new Set(
          es.flatMap((e) => [
            ...e.practices
              .filter((p) => p.status !== "未练" && p.skillId)
              .map((p) => p.skillId),
          ]),
        ),
      ].map((id) => [
        id,
        es.filter((e) =>
          e.practices.some((p) => p.skillId === id && p.status !== "未练"),
        ).length,
      ]),
    ),
  };
}
const dbName = "xueji-local";
export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(dbName, 1);
    r.onblocked = () => reject(Error("请关闭其他雪迹标签后重试"));
    r.onupgradeneeded = () => r.result.createObjectStore("data");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function readData(): Promise<Data> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("data");
    const r = tx.objectStore("data").get("main");
    r.onsuccess = () => {
      try {
        resolve(r.result ? migrate(r.result) : initial());
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}
export async function writeData(data: Data) {
  validate(data);
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("data", "readwrite");
    tx.objectStore("data").put(data, "main");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => reject(tx.error);
  });
}
// Explicit migration boundary: unsupported versions are rejected, never reset.
export function migrate(value: unknown): Data {
  validate(value);
  return value as Data;
}
export function validate(value: unknown): asserts value is Data {
  const d = value as Data;
  if (!d || typeof d !== "object" || d.version !== 1)
    throw Error("不支持的数据版本");
  const obj = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  const str = (v: unknown) => typeof v === "string";
  const date = (v: unknown) =>
    str(v) &&
    /^\d{4}-\d{2}-\d{2}$/.test(v as string) &&
    new Date(v as string).toISOString().slice(0, 10) === v;
  const fields = (v: any, keys: string[]) =>
    obj(v) && keys.every((k) => str(v[k]));
  const equip = (v: any) =>
    fields(v, [
      "id",
      "name",
      "board",
      "length",
      "boots",
      "bindings",
      "front",
      "rear",
      "width",
    ]);
  const entry = (v: any) =>
    fields(v, [
      "id",
      "date",
      "resort",
      "snow",
      "terrain",
      "energy",
      "confidence",
      "minutes",
      "learned",
      "best",
      "problem",
      "next",
      "coach",
      "body",
      "video",
      "gearFeel",
    ]) &&
    (date(v.date) || v.date === "") &&
    (v.minutes === "" ||
      (Number.isFinite(Number(v.minutes)) && Number(v.minutes) >= 0)) &&
    Array.isArray(v.goals) &&
    v.goals.every(str) &&
    Array.isArray(v.practices) &&
    v.practices.every(
      (p: any) =>
        fields(p, ["cardId", "skillId", "status"]) &&
        ["未练", "已尝试", "继续练"].includes(p.status) &&
        (p.custom === undefined || str(p.custom)),
    ) &&
    (v.equipment === null || equip(v.equipment));
  if (
    !fields(d.profile, ["nickname", "years", "stance", "focus"]) ||
    !fields(d.season, ["name", "start", "end"]) ||
    !date(d.season.start) ||
    !date(d.season.end) ||
    d.season.start > d.season.end ||
    !Array.isArray(d.season.goals) ||
    d.season.goals.length > 3 ||
    !d.season.goals.every((g) => fields(g, ["text", "skillId"])) ||
    !Array.isArray(d.entries) ||
    !d.entries.every((e) => entry(e) && date(e.date) && e.resort.trim()) ||
    new Set(d.entries.map((e) => e.id)).size !== d.entries.length ||
    !(d.draft === null || entry(d.draft)) ||
    !Array.isArray(d.equipment) ||
    !d.equipment.every(equip) ||
    !Array.isArray(d.customSkills) ||
    !d.customSkills.every((s) =>
      fields(s, ["id", "name", "group", "description", "prereq"]),
    ) ||
    !obj(d.assessments) ||
    !Object.values(d.assessments).every(
      (a) =>
        fields(a, ["state", "terrain", "snow", "note"]) &&
        ["未尝试", "练习中", "偶尔完成", "稳定完成"].includes(a.state) &&
        Array.isArray(a.history) &&
        a.history.every(
          (h) =>
            fields(h, ["date", "state", "note"]) && !isNaN(Date.parse(h.date)),
        ),
    ) ||
    !obj(d.settings) ||
    typeof d.settings.large !== "boolean" ||
    !(
      d.settings.lastExport === null ||
      (str(d.settings.lastExport) && !isNaN(Date.parse(d.settings.lastExport)))
    ) ||
    !Number.isInteger(d.settings.exportCount) ||
    d.settings.exportCount < 0
  )
    throw Error("备份结构不完整或字段无效");
}
export function backup(d: Data) {
  return JSON.stringify(
    { format: "xueji-backup", exportedAt: new Date().toISOString(), data: d },
    null,
    2,
  );
}
export function parseBackup(text: string) {
  const b = JSON.parse(text);
  if (
    b.format !== "xueji-backup" ||
    typeof b.exportedAt !== "string" ||
    isNaN(Date.parse(b.exportedAt))
  )
    throw Error("不是有效的雪迹备份");
  return { date: b.exportedAt, data: migrate(b.data) };
}
