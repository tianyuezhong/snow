import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  initial,
  newEntry,
  stats,
  backup,
  parseBackup,
  writeData,
  readData,
} from "./core";
import { skills, cards, matchCards } from "./library";
test("同日多篇只计一天，雪季外记录不计入，时长独立累计", () => {
  const d = initial();
  d.season.start = "2026-01-01";
  d.season.end = "2026-12-31";
  d.entries = [
    { ...newEntry(), date: "2026-02-01", resort: "A", minutes: "60" },
    { ...newEntry(), date: "2026-02-01", resort: "B", minutes: "30" },
    { ...newEntry(), date: "2025-01-01", minutes: "120" },
  ];
  assert.equal(stats(d).days, 1);
  assert.equal(stats(d).minutes, 90);
  assert.equal(stats(d).resorts.length, 2);
});
test("IndexedDB 新建、编辑、删除和重新打开", async () => {
  const d = initial();
  const e = { ...newEntry(), resort: "测试雪场" };
  d.entries.push(e);
  await writeData(d);
  assert.equal((await readData()).entries[0].resort, "测试雪场");
  d.entries[0].best = "转弯更可控";
  await writeData(d);
  assert.equal((await readData()).entries[0].best, "转弯更可控");
  d.entries = [];
  await writeData(d);
  assert.equal((await readData()).entries.length, 0);
});
test("完整备份恢复与错误文件拒绝，原存储不被改变", async () => {
  const d = initial();
  d.entries = [{ ...newEntry(), resort: "原记录" }];
  await writeData(d);
  assert.deepEqual(parseBackup(backup(d)).data, d);
  for (const text of [
    "bad",
    "{}",
    JSON.stringify({
      format: "xueji-backup",
      exportedAt: new Date().toISOString(),
      data: { ...d, entries: [{}] },
    }),
    JSON.stringify({
      format: "xueji-backup",
      exportedAt: new Date().toISOString(),
      data: { ...d, version: 99 },
    }),
  ])
    assert.throws(() => parseBackup(text));
  assert.equal((await readData()).entries[0].resort, "原记录");
});
test("修改装备档案不会改变历史快照", () => {
  const d = initial();
  const eq = {
    id: "gear",
    name: "第一套",
    board: "A",
    length: "150",
    boots: "B",
    bindings: "C",
    front: "15",
    rear: "-9",
    width: "52",
  };
  d.equipment = [eq];
  d.entries = [
    { ...newEntry(), resort: "测试雪场", equipment: structuredClone(eq) },
  ];
  eq.front = "21";
  assert.equal(d.entries[0].equipment?.front, "15");
  assert.equal(parseBackup(backup(d)).data.entries[0].equipment?.front, "15");
});
test("所有练习关联存在的技能，匹配 1–2 个目标得到 2–3 张卡", () => {
  for (const c of cards) assert.ok(skills.some((s) => s.id === c.skillId));
  for (const s of skills) {
    const cs = matchCards([s.id]);
    assert.ok(cs.length >= 2 && cs.length <= 3);
    assert.ok(cs.every((c) => c.skillId === s.id));
    assert.ok(cs.every((c) => cards.some((x) => x.id === c.id)));
  }
  assert.equal(matchCards([skills[0].id, skills[1].id]).length, 3);
});
test("只有尝试的手动添加练习也进入技能统计，不自动写自评", () => {
  const d = initial();
  d.entries = [
    {
      ...newEntry(),
      practices: [{ cardId: "c0", skillId: skills[0].id, status: "已尝试" }],
    },
  ];
  assert.equal(stats(d).counts[skills[0].id], 1);
  assert.equal(Object.keys(d.assessments).length, 0);
});

test("未填完的草稿可恢复，非法正式记录不会覆盖已有存储", async () => {
  const d = initial();
  d.draft = { ...newEntry(), date: "", resort: "" };
  await writeData(d);
  assert.equal((await readData()).draft?.date, "");
  const bad = {
    ...d,
    entries: [{ ...newEntry(), resort: "测试雪场", date: "2026-02-30" }],
  };
  await assert.rejects(writeData(bad));
  assert.equal((await readData()).entries.length, 0);
  assert.equal((await readData()).draft?.date, "");
});
test("计划和未练不计次数，同一篇日记的同技能多张卡只计一次", () => {
  const d = initial();
  const skillId = skills[0].id;
  d.entries = [
    {
      ...newEntry(),
      goals: [skillId],
      practices: [{ cardId: "c0", skillId, status: "未练" }],
    },
  ];
  assert.deepEqual(stats(d).counts, {});
  d.entries[0].practices = [
    { cardId: "c0", skillId, status: "已尝试" },
    { cardId: "c0-review", skillId, status: "继续练" },
  ];
  assert.equal(stats(d).counts[skillId], 1);
});
