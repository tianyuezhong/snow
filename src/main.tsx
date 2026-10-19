import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { skills, cards, groups, states, matchCards } from "./library";
import {
  type Data,
  type Entry,
  type Equipment,
  type Assessment,
  initial,
  newEntry,
  uid,
  readData,
  writeData,
  stats,
  backup,
  parseBackup,
  today,
  seasonEntries,
} from "./core";
import "./style.css";
const tabs = ["今天滑雪", "滑雪日记", "技能成长", "我的雪季"],
  icons = ["◒", "▤", "↗", "◇"];
function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        min={type === "number" ? 0 : undefined}
      />
    </label>
  );
}
function App() {
  const [data, setData] = useState<Data | null>(null),
    [tab, setTab] = useState(0),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("正在读取本地数据…"),
    [editing, setEditing] = useState(false),
    [quick, setQuick] = useState(false),
    [entry, setEntry] = useState<Entry | null>(null),
    [filter, setFilter] = useState({ resort: "", skill: "", from: "", to: "" }),
    [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [pending, setPending] = useState<ReturnType<typeof parseBackup> | null>(
      null,
    ),
    [offline, setOffline] = useState(false);
  const queue = useRef(Promise.resolve());
  const saveRevision = useRef(0);
  useEffect(() => {
    readData()
      .then((d) => {
        setData(d);
        setSaved("已读取本地数据");
      })
      .catch(() =>
        setError(
          "本地数据读取失败。请关闭其他标签后刷新；应用不会覆盖原数据。",
        ),
      );
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      navigator.serviceWorker
        .register("./sw.js")
        .then(async (r) => {
          await navigator.serviceWorker.ready;
          setOffline(!!r.active);
          navigator.serviceWorker.addEventListener("message", (e) => {
            if (e.data === "OFFLINE_READY") setOffline(true);
          });
        })
        .catch(() => setOffline(false));
  }, []);
  function persist(next: Data) {
    const revision = ++saveRevision.current;
    setData(next);
    setSaved("正在保存…");
    queue.current = queue.current
      .catch(() => {})
      .then(() => writeData(next))
      .then(() => {
        if (revision === saveRevision.current) {
          setSaved("已保存在此设备");
          setError("");
        }
      })
      .catch(() => {
        if (revision !== saveRevision.current) return;
        setSaved("保存失败");
        setError(
          "保存失败，可能是设备存储不足。请重试保存或立即导出备份，暂勿关闭页面。",
        );
      });
  }
  function update(p: Partial<Data>) {
    if (data) persist({ ...data, ...p });
  }
  function draftWouldBeReplaced(e: Entry) {
    return !!data?.draft && data.draft.id !== e.id;
  }
  function edit(e: Entry, isNew = false, quickMode = false) {
    if (
      draftWouldBeReplaced(e) &&
      !confirm("已有未完成的草稿。打开这篇记录将替换草稿，继续吗？")
    )
      return;
    setQuick(quickMode);
    setEntry(structuredClone(e));
    setEditing(true);
    update({ draft: structuredClone(e) });
  }
  function change(p: Partial<Entry>) {
    if (!entry || !data) return;
    const next = { ...entry, ...p };
    setEntry(next);
    update({ draft: next });
  }
  function finish(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !entry) return;
    if (!entry.resort.trim() || !entry.date || Number(entry.minutes) < 0)
      return;
    update({
      entries: [
        ...data.entries.filter((x) => x.id !== entry.id),
        structuredClone(entry),
      ],
      draft: null,
    });
    setEditing(false);
    setEntry(null);
    setTab(1);
  }
  function exportData() {
    if (!data) return;
    const next = {
      ...data,
      settings: {
        ...data.settings,
        lastExport: new Date().toISOString(),
        exportCount: data.entries.length,
      },
    };
    const blob = new Blob([backup(next)], { type: "application/json" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `雪迹备份-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    persist(next);
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 20_000_000) throw Error("文件过大（最大 20 MB）");
      setPending(parseBackup(await file.text()));
    } catch (e) {
      setError(
        `导入失败：${e instanceof Error ? e.message : "文件无效"}。原数据未改变。`,
      );
    }
  }
  if (!data)
    return (
      <main>
        <h1>雪迹</h1>
        <p>{error || "正在打开你的滑雪手账…"}</p>
      </main>
    );
  const d = data,
    allSkills = [...skills, ...d.customSkills],
    st = stats(d),
    sorted = [...d.entries].sort((a, b) => b.date.localeCompare(a.date)),
    last = sorted[0],
    current = allSkills.find((s) => s.id === selected),
    assessment = d.assessments[selected] || {
      state: "未尝试",
      terrain: "",
      snow: "",
      note: "",
      history: [],
    };
  function assess(p: Partial<Assessment>) {
    const a = { ...assessment, ...p };
    if (p.state && p.state !== assessment.state)
      a.history = [
        ...a.history,
        { date: new Date().toISOString(), state: p.state, note: a.note },
      ];
    update({ assessments: { ...d.assessments, [selected]: a } });
  }
  function equipmentUpdate(id: string, p: Partial<Equipment>) {
    update({
      equipment: d.equipment.map((e) => (e.id === id ? { ...e, ...p } : e)),
    });
  }
  function practiceCard(p: Entry["practices"][number], i: number) {
    const card = cards.find((c) => c.id === p.cardId);
    return (
      <article className="practice" key={`${p.cardId}-${i}`}>
        <div className="row">
          <span className="eyebrow">练习 {String(i + 1).padStart(2, "0")}</span>
          <button
            type="button"
            className="text"
            onClick={() =>
              change({ practices: entry!.practices.filter((_, j) => j !== i) })
            }
          >
            移除
          </button>
        </div>
        <h3>{p.custom || card?.title || "自定义练习"}</h3>
        {card && (
          <>
            <p>{card.purpose}</p>
            <details>
              <summary>展开练习卡 · 步骤与自查</summary>
              <p>
                <b>前置能力：</b>
                {card.prereq}
              </p>
              <p>
                <b>地形：</b>
                {card.terrain}
              </p>
              <ol>
                {card.steps.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ol>
              <p>
                <b>关键提示：</b>
                {card.tips}
              </p>
              <p>
                <b>常见错误：</b>
                {card.errors}
              </p>
              <p>
                <b>自查：</b>
                {card.check}
              </p>
            </details>
          </>
        )}
        <div className="chips">
          {["未练", "已尝试", "继续练"].map((s) => (
            <button
              type="button"
              className={s === p.status ? "active" : ""}
              key={s}
              onClick={() =>
                change({
                  practices: entry!.practices.map((v, j) =>
                    j === i ? { ...v, status: s } : v,
                  ),
                })
              }
            >
              {s}
            </button>
          ))}
        </div>
        <label className="field">
          替换练习
          <select
            value=""
            onChange={(e) => {
              const c = cards.find((x) => x.id === e.target.value);
              if (c)
                change({
                  practices: entry!.practices.map((v, j) =>
                    j === i
                      ? { cardId: c.id, skillId: c.skillId, status: "未练" }
                      : v,
                  ),
                });
            }}
          >
            <option value="">选择另一张练习卡</option>
            {cards.map((c) => (
              <option value={c.id} key={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      </article>
    );
  }
  return (
    <div className={d.settings.large ? "app large" : "app"}>
      <header>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab(0);
          }}
        >
          <span className="brand-icon">∧</span>雪迹
          <span className="brand-en">SNOW JOURNAL</span>
        </a>
        <span className="save-state">● {saved}</span>
      </header>
      <main>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => persist(d)}>重试保存</button>
            <button onClick={exportData}>导出当前数据</button>
            <button onClick={() => setError("")}>关闭提示</button>
          </div>
        )}
        {tab === 0 && (
          <>
            <div className="page-heading">
              <span className="eyebrow">YOUR NEXT TURN</span>
              <span>{d.season.name}</span>
            </div>
            <section className="hero">
              <div className="mountains" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <div className="hero-content">
                <span className="pill">每一次上雪，都算成长</span>
                <h1>
                  留下一道雪迹。
                  <br />
                  也留下一点进步。
                </h1>
                <p>从一个小目标开始，找到自己的滑行节奏。</p>
                <button
                  className="primary"
                  onClick={() => {
                    if (d.draft) {
                      edit(d.draft);
                      return;
                    }
                    edit(newEntry(), true);
                  }}
                >
                  {d.draft ? "继续今天的滑雪" : "开始今天的滑雪"} <span>↗</span>
                </button>
              </div>
              <div className="hero-foot">
                MOUNTAINS ARE CALLING <span>慢一点，感受每一道弯。</span>
              </div>
            </section>
            <div className="stats">
              <div>
                <strong>
                  {st.days}
                  <small>天</small>
                </strong>
                <span>本雪季滑雪</span>
              </div>
              <div>
                <strong>
                  {st.resorts.length}
                  <small>个</small>
                </strong>
                <span>到访雪场</span>
              </div>
              <div>
                <strong>
                  {Object.values(st.counts).reduce((a, b) => a + b, 0)}
                  <small>次</small>
                </strong>
                <span>关联技能练习</span>
              </div>
            </div>
            <div className="section-title">
              <h2>接着上一次，继续</h2>
              <span>A LITTLE BETTER</span>
            </div>
            <section className="card next">
              <span className="mini-icon">↗</span>
              <div>
                <span className="eyebrow">上次留下的待练问题</span>
                <h3>
                  {last?.next || last?.problem || "下一道弯，从你的小目标开始"}
                </h3>
                <p>
                  {last
                    ? `${last.date} · ${last.resort}`
                    : "还没有滑雪记录。选 1–2 个目标，开始第一天。"}
                </p>
              </div>
              <button
                onClick={() => {
                  if (d.draft) edit(d.draft);
                  else {
                    const e = newEntry();
                    if (last) {
                      e.goals = last.goals.slice(0, 2);
                      e.practices = last.practices.map((p) => ({
                        ...p,
                        status: "未练",
                      }));
                      e.resort = last.resort;
                      e.equipment = last.equipment;
                    }
                    edit(e, true);
                  }
                }}
              >
                继续上次练习 →
              </button>
            </section>
            <div className="two-col">
              <section className="card">
                <span className="eyebrow">最近一次记录</span>
                <h3>
                  {last
                    ? `${last.resort} · ${last.date}`
                    : "你的第一篇雪上手账"}
                </h3>
                <p>
                  {last?.best || "不必写得完整，记住一个值得留下的瞬间就好。"}
                </p>
                <button
                  className="text"
                  onClick={() => (last ? edit(last) : edit(newEntry(), true))}
                >
                  {last ? "查看 / 编辑记录" : "写一篇快速记录"} →
                </button>
              </section>
              <section className="card tint">
                <span className="eyebrow">给今天的自己</span>
                <h3>练习，不等于掌握。</h3>
                <p>
                  在能力范围内练习。复杂地形和跳跃，建议寻求教练指导。这里是一般练习参考，不是认证课程。
                </p>
                <button className="text" onClick={() => setTab(2)}>
                  查看我的技能 →
                </button>
              </section>
            </div>
          </>
        )}
        {tab === 1 && (
          <>
            <div className="page-heading">
              <span className="eyebrow">DAYS ON SNOW</span>
              <span>{d.entries.length} 篇记录</span>
            </div>
            <h1>滑雪日记</h1>
            <p>每一个小进步，都值得留下。</p>
            <button
              className="primary"
              onClick={() => edit(d.draft || newEntry(), !d.draft, true)}
            >
              ＋ 一分钟快速记录
            </button>
            <section className="card filters">
              <Field
                label="雪场关键词"
                value={filter.resort}
                onChange={(v) => setFilter({ ...filter, resort: v })}
              />
              <label className="field">
                技能
                <select
                  value={filter.skill}
                  onChange={(e) =>
                    setFilter({ ...filter, skill: e.target.value })
                  }
                >
                  <option value="">全部技能</option>
                  {allSkills.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="起始日期"
                type="date"
                value={filter.from}
                onChange={(v) => setFilter({ ...filter, from: v })}
              />
              <Field
                label="结束日期"
                type="date"
                value={filter.to}
                onChange={(v) => setFilter({ ...filter, to: v })}
              />
              <button
                className="text"
                onClick={() =>
                  setFilter({ resort: "", skill: "", from: "", to: "" })
                }
              >
                清除筛选
              </button>
            </section>
            {(() => {
              const es = sorted.filter(
                (e) =>
                  e.resort.includes(filter.resort) &&
                  (!filter.skill ||
                    e.goals.includes(filter.skill) ||
                    e.practices.some((p) => p.skillId === filter.skill)) &&
                  (!filter.from || e.date >= filter.from) &&
                  (!filter.to || e.date <= filter.to),
              );
              return es.length ? (
                es.map((e) => (
                  <article className="card journal" key={e.id}>
                    <span className="eyebrow">
                      {e.date} · {e.snow} · {e.terrain}
                    </span>
                    <h2>{e.resort}</h2>
                    <p>{e.learned || "今天也留下了一道雪迹。"}</p>
                    {e.best && <p>✧ 最满意：{e.best}</p>}
                    {e.problem && <p>待解决：{e.problem}</p>}
                    {e.next && <p>下次练：{e.next}</p>}
                    <div className="tags">
                      {e.goals.map((id) => (
                        <span key={id}>
                          {allSkills.find((s) => s.id === id)?.name ||
                            "自定义技能"}
                        </span>
                      ))}
                    </div>
                    <details>
                      <summary>练习、装备与更多记录</summary>
                      {e.practices.map((p, i) => (
                        <p key={i}>
                          {p.custom ||
                            cards.find((c) => c.id === p.cardId)?.title}{" "}
                          · {p.status}
                        </p>
                      ))}
                      <p>时长：{e.minutes || "未填写"} 分钟</p>
                      <p>
                        装备快照：
                        {e.equipment
                          ? `${e.equipment.name} / ${e.equipment.board} ${e.equipment.length} / 雪鞋 ${e.equipment.boots} / 固定器 ${e.equipment.bindings} / ${e.equipment.front}° / ${e.equipment.rear}° / 站距 ${e.equipment.width} cm`
                          : "未选择"}
                      </p>
                      {[
                        ["教练反馈", e.coach],
                        ["身体感受", e.body],
                        ["装备感受", e.gearFeel],
                        ["视频备注", e.video],
                      ].map(
                        ([k, v]) =>
                          v && (
                            <p key={k}>
                              {k}：{v}
                            </p>
                          ),
                      )}
                    </details>
                    <div className="row">
                      <button onClick={() => edit(e)}>查看 / 修改</button>
                      <button
                        className="danger text"
                        onClick={() => {
                          if (
                            confirm(
                              `删除 ${e.date} ${e.resort} 的这篇记录？此操作不能撤销。`,
                            )
                          )
                            update({
                              entries: d.entries.filter((x) => x.id !== e.id),
                              draft: d.draft?.id === e.id ? null : d.draft,
                            });
                        }}
                      >
                        删除记录
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <section className="empty">
                  {d.entries.length
                    ? "没有符合条件的记录，试试清除筛选。"
                    : "还没有记录。第一篇可以只填写日期和雪场。"}
                </section>
              );
            })()}
          </>
        )}
        {tab === 2 && (
          <>
            <div className="page-heading">
              <span className="eyebrow">PROGRESS AT YOUR PACE</span>
              <span>自评，由你确认</span>
            </div>
            <h1>技能成长</h1>
            <p>没有必须解锁的路线，找到你想练的下一步。</p>
            <input
              aria-label="搜索技能"
              placeholder="搜索技能，如 carving、换刃"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {[...groups, "自定义技能"].map((g) => (
              <section key={g}>
                <div className="section-title">
                  <h2>{g}</h2>
                </div>
                <div className="skill-grid">
                  {allSkills
                    .filter(
                      (s) =>
                        s.group === g &&
                        s.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((s) => (
                      <button
                        className="skill card"
                        key={s.id}
                        onClick={() => setSelected(s.id)}
                      >
                        <span>{s.name}</span>
                        <small>
                          {d.assessments[s.id]?.state || "未尝试"} ↗
                        </small>
                      </button>
                    ))}
                </div>
              </section>
            ))}
            {!allSkills.some((s) =>
              s.name.toLowerCase().includes(search.toLowerCase()),
            ) && <p className="empty">没有找到技能，可以在下面新增。</p>}
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                update({
                  customSkills: [
                    ...d.customSkills,
                    {
                      id: uid(),
                      name: String(f.get("name")).trim(),
                      group: "自定义技能",
                      description: String(f.get("description")),
                      prereq: String(f.get("prereq")),
                    },
                  ],
                });
                e.currentTarget.reset();
              }}
            >
              <h3>＋ 新增自定义技能</h3>
              <label className="field">
                技能名称
                <input name="name" required maxLength={80} />
              </label>
              <label className="field">
                简短说明
                <input name="description" />
              </label>
              <label className="field">
                前置基础
                <input name="prereq" />
              </label>
              <button type="submit">添加技能</button>
            </form>
            <p className="hint">
              一般练习参考，不代表官方教练课程或认证。自评不会自动判定你适合任何雪道。
            </p>
          </>
        )}
        {tab === 3 && (
          <>
            <div className="page-heading">
              <span className="eyebrow">A SEASON TO REMEMBER</span>
              <span>属于你的雪季</span>
            </div>
            <h1>我的雪季</h1>
            <section className="card">
              <Field
                label="雪季名称"
                value={d.season.name}
                onChange={(v) => update({ season: { ...d.season, name: v } })}
              />
              <div className="two-col">
                <Field
                  label="开始日期"
                  type="date"
                  value={d.season.start}
                  onChange={(v) => {
                    if (v)
                      update({
                        season: {
                          ...d.season,
                          start: v,
                          end: v > d.season.end ? v : d.season.end,
                        },
                      });
                  }}
                />
                <Field
                  label="结束日期"
                  type="date"
                  value={d.season.end}
                  onChange={(v) => {
                    if (v)
                      update({
                        season: {
                          ...d.season,
                          end: v,
                          start: v < d.season.start ? v : d.season.start,
                        },
                      });
                  }}
                />
              </div>
            </section>
            <div className="stats">
              <div>
                <strong>
                  {st.days}
                  <small>天</small>
                </strong>
                <span>不同日期计数</span>
              </div>
              <div>
                <strong>
                  {+(st.minutes / 60).toFixed(1)}
                  <small>小时</small>
                </strong>
                <span>已填写时长</span>
              </div>
              <div>
                <strong>
                  {st.resorts.length}
                  <small>个</small>
                </strong>
                <span>到访雪场</span>
              </div>
            </div>
            <section className="card">
              <h2>练习分布</h2>
              <p>{st.resorts.join(" · ") || "还没有到访雪场"}</p>
              {Object.entries(st.counts).length ? (
                Object.entries(st.counts).map(([id, n]) => (
                  <div className="bar-row" key={id}>
                    <span>
                      {allSkills.find((s) => s.id === id)?.name || "技能"}
                    </span>
                    <div className="bar">
                      <i
                        style={{
                          width: `${(n / Math.max(...Object.values(st.counts))) * 100}%`,
                        }}
                      />
                    </div>
                    <b>{n} 次</b>
                  </div>
                ))
              ) : (
                <p>
                  将练习标记为“已尝试”或“继续练”并保存日记后，这里会出现分布。
                </p>
              )}
              <h3>活动记录</h3>
              <div className="activity">
                {Array.from({ length: 12 }, (_, i) => {
                  const dates = seasonEntries(d)
                    .map((e) => e.date)
                    .filter((x) => Number(x.slice(5, 7)) === i + 1);
                  const n = new Set(dates).size;
                  return (
                    <div key={i}>
                      <i
                        style={{
                          height: `${12 + Math.min(n, 31) * 3}px`,
                          background: n ? "#367e83" : "#e5eeed",
                        }}
                      />
                      <small>{i + 1}月</small>
                      <span>{n}天</span>
                    </div>
                  );
                })}
              </div>
              <p className="hint">
                仅统计当前雪季范围内的记录；同日多篇只计一天。技能次数按有已尝试或继续练标记的日记计，每篇每项一次。
              </p>
            </section>
            <section className="card">
              <h2>
                雪季目标 <small>最多 3 个</small>
              </h2>
              {d.season.goals.map((g, i) => (
                <div className="goal" key={i}>
                  <Field
                    label={`目标 ${i + 1}`}
                    value={g.text}
                    onChange={(v) =>
                      update({
                        season: {
                          ...d.season,
                          goals: d.season.goals.map((x, j) =>
                            j === i ? { ...x, text: v } : x,
                          ),
                        },
                      })
                    }
                  />
                  <select
                    aria-label="关联技能"
                    value={g.skillId}
                    onChange={(e) =>
                      update({
                        season: {
                          ...d.season,
                          goals: d.season.goals.map((x, j) =>
                            j === i ? { ...x, skillId: e.target.value } : x,
                          ),
                        },
                      })
                    }
                  >
                    <option value="">可选关联技能</option>
                    {allSkills.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="text danger"
                    onClick={() =>
                      update({
                        season: {
                          ...d.season,
                          goals: d.season.goals.filter((_, j) => j !== i),
                        },
                      })
                    }
                  >
                    移除
                  </button>
                </div>
              ))}
              {d.season.goals.length < 3 && (
                <button
                  onClick={() =>
                    update({
                      season: {
                        ...d.season,
                        goals: [...d.season.goals, { text: "", skillId: "" }],
                      },
                    })
                  }
                >
                  ＋ 添加目标
                </button>
              )}
            </section>
            <section className="card">
              <h2>个人档案</h2>
              {(
                [
                  ["nickname", "昵称"],
                  ["years", "板龄"],
                  ["focus", "希望提升的方向"],
                ] as const
              ).map(([k, l]) => (
                <Field
                  key={k}
                  label={l}
                  value={d.profile[k]}
                  onChange={(v) =>
                    update({ profile: { ...d.profile, [k]: v } })
                  }
                />
              ))}
              <label className="field">
                站姿
                <select
                  value={d.profile.stance}
                  onChange={(e) =>
                    update({
                      profile: { ...d.profile, stance: e.target.value },
                    })
                  }
                >
                  <option>Regular</option>
                  <option>Goofy</option>
                </select>
              </label>
            </section>
            <section className="card">
              <h2>我的装备</h2>
              <p>每次选择装备时保存快照，修改档案不会改变历史日记。</p>
              {d.equipment.map((eq) => (
                <details key={eq.id}>
                  <summary>{eq.name || "未命名装备"}</summary>
                  {(
                    [
                      ["name", "装备名称"],
                      ["board", "雪板型号"],
                      ["length", "雪板长度（cm）"],
                      ["boots", "雪鞋"],
                      ["bindings", "固定器"],
                      ["front", "前脚角度（°）"],
                      ["rear", "后脚角度（°）"],
                      ["width", "站距（cm）"],
                    ] as const
                  ).map(([k, l]) => (
                    <Field
                      key={k}
                      label={l}
                      value={eq[k]}
                      onChange={(v) => equipmentUpdate(eq.id, { [k]: v })}
                    />
                  ))}
                  <button
                    className="danger"
                    onClick={() => {
                      if (confirm("删除这套装备档案？历史快照仍会保留。"))
                        update({
                          equipment: d.equipment.filter((x) => x.id !== eq.id),
                        });
                    }}
                  >
                    删除装备档案
                  </button>
                </details>
              ))}
              <button
                onClick={() =>
                  update({
                    equipment: [
                      ...d.equipment,
                      {
                        id: uid(),
                        name: `装备 ${d.equipment.length + 1}`,
                        board: "",
                        length: "",
                        boots: "",
                        bindings: "",
                        front: "",
                        rear: "",
                        width: "",
                      },
                    ],
                  })
                }
              >
                ＋ 新增装备
              </button>
            </section>
            <section className="card backup">
              <span className="eyebrow">KEEP YOUR MEMORIES SAFE</span>
              <h2>本地数据与备份</h2>
              <p>
                <b>数据仅保存在此设备，建议定期备份。</b>
                清除网站数据、更换设备或浏览器回收存储，可能导致数据丢失。
              </p>
              <p>
                上次导出：
                {d.settings.lastExport
                  ? new Date(d.settings.lastExport).toLocaleString("zh-CN")
                  : "尚未导出"}
              </p>
              {d.entries.length - d.settings.exportCount >= 5 && (
                <p className="notice">
                  又留下了 5 篇以上记录，找时间备份一下吧。
                </p>
              )}
              <div className="row">
                <button className="primary" onClick={exportData}>
                  导出完整 JSON 备份 ↓
                </button>
                <label className="file-button">
                  从备份恢复
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      importFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <p className="hint">
                导出后请把文件保存到“文件”App 或电脑。导出文件不是云端同步。
              </p>
              <p>
                {offline
                  ? "离线缓存已就绪（需在此浏览器内验证）"
                  : "离线缓存尚未确认，请在生产预览中首次联网打开。"}
              </p>
              <button
                onClick={async () => {
                  if (navigator.storage?.persist) {
                    const ok = await navigator.storage.persist();
                    setSaved(
                      ok
                        ? "已获得持久存储许可"
                        : "浏览器未授予持久存储，请继续定期备份",
                    );
                  } else setSaved("此浏览器不支持持久存储请求");
                }}
              >
                请求浏览器保留本地数据
              </button>
            </section>
          </>
        )}
        <footer>
          <span>雪迹 · 记录每一次向前</span>
          <span>仅此设备保存 · 记得备份</span>
        </footer>
      </main>
      <nav aria-label="主导航">
        {tabs.map((t, i) => (
          <button
            key={t}
            className={tab === i ? "selected" : ""}
            onClick={() => {
              setTab(i);
              window.scrollTo({ top: 0 });
            }}
          >
            <span>{icons[i]}</span>
            {t}
          </button>
        ))}
      </nav>
      {editing && entry && (
        <div className="overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="滑雪记录编辑"
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">TODAY'S SNOW NOTES</span>
                <h2>今天，想练点什么？</h2>
              </div>
              <button
                onClick={() => {
                  setEditing(false);
                  setEntry(null);
                }}
              >
                收起
              </button>
            </div>
            <p className="hint">
              编辑自动存为草稿；点击底部按钮后收入日记。{saved}
            </p>
            <form onSubmit={finish}>
              <div className="two-col">
                <Field
                  label="日期 *"
                  type="date"
                  required
                  value={entry.date}
                  onChange={(v) => change({ date: v })}
                />
                <label className="field">
                  雪场 *
                  <input
                    required
                    list="resorts"
                    value={entry.resort}
                    onChange={(e) => change({ resort: e.target.value })}
                  />
                  <datalist id="resorts">
                    {[...new Set(d.entries.map((e) => e.resort))].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </datalist>
                </label>
              </div>
              <details open={!quick}>
                <summary>训练目标、练习卡与出发状态（可选）</summary>
                <div className="two-col">
                  {(
                    [
                      [
                        "snow",
                        "雪况",
                        ["压雪", "粉雪", "硬雪 / 冰面", "湿雪", "混合 / 烂雪"],
                      ],
                      [
                        "terrain",
                        "地形",
                        [
                          "初级缓坡",
                          "中级坡",
                          "陡坡",
                          "平地",
                          "树林",
                          "蘑菇",
                          "公园",
                        ],
                      ],
                      ["energy", "精力", ["充足", "一般", "疲劳"]],
                      ["confidence", "信心", ["平稳", "有些紧张", "状态很好"]],
                    ] as const
                  ).map(([key, label, options]) => (
                    <label className="field" key={key}>
                      {label}
                      <select
                        value={entry[key]}
                        onChange={(e) => change({ [key]: e.target.value })}
                      >
                        {options.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <h3>
                  选择 1–2 个训练目标 <small>可跳过</small>
                </h3>
                <div className="chips goals">
                  {allSkills.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={entry.goals.includes(s.id) ? "active" : ""}
                      disabled={
                        !entry.goals.includes(s.id) && entry.goals.length >= 2
                      }
                      onClick={() => {
                        const goals = entry.goals.includes(s.id)
                          ? entry.goals.filter((id) => id !== s.id)
                          : [...entry.goals, s.id];
                        change({
                          goals,
                          practices: matchCards(goals).map((c) => ({
                            cardId: c.id,
                            skillId: c.skillId,
                            status: "未练",
                          })),
                        });
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
                <p className="hint">
                  按所选技能直接匹配练习，不根据雪况推断能力。每次匹配 2–3
                  张练习与复盘卡，可自行调整。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const matched = matchCards(entry.goals);
                    change({
                      practices: matched.map((c) => ({
                        cardId: c.id,
                        skillId: c.skillId,
                        status: "未练",
                      })),
                    });
                  }}
                >
                  按目标匹配 / 重置练习卡
                </button>
                <div className="row">
                  <h3>今天的练习</h3>
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        settings: { ...d.settings, large: !d.settings.large },
                      })
                    }
                  >
                    {d.settings.large ? "标准字号" : "大字模式"}
                  </button>
                </div>
                {entry.goals.length > 0 && entry.practices.length === 0 && (
                  <p className="hint">
                    所选技能没有匹配的内置练习，或练习已移除。可在下方自行添加。
                  </p>
                )}
                {entry.practices.map(practiceCard)}
                <label className="field">
                  添加内置练习
                  <select
                    value=""
                    onChange={(e) => {
                      const c = cards.find((c) => c.id === e.target.value);
                      if (c)
                        change({
                          practices: [
                            ...entry.practices,
                            {
                              cardId: c.id,
                              skillId: c.skillId,
                              status: "未练",
                            },
                          ],
                        });
                    }}
                  >
                    <option value="">选择练习卡</option>
                    {cards.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="row">
                  <input
                    aria-label="自定义练习内容"
                    id="custom-practice"
                    placeholder="也可以写下自己的练习"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById(
                        "custom-practice",
                      ) as HTMLInputElement;
                      if (input.value.trim()) {
                        change({
                          practices: [
                            ...entry.practices,
                            {
                              cardId: uid(),
                              skillId: entry.goals[0] || "",
                              status: "未练",
                              custom: input.value.trim(),
                            },
                          ],
                        });
                        input.value = "";
                      }
                    }}
                  >
                    添加
                  </button>
                </div>
              </details>
              <h3>滑后一写 · 一分钟就好</h3>
              {(
                [
                  ["learned", "今天练了什么"],
                  ["best", "最满意的一点"],
                  ["problem", "遇到的问题"],
                  ["next", "下次想练什么"],
                ] as const
              ).map(([k, l]) => (
                <label className="field" key={k}>
                  {l}
                  <textarea
                    rows={2}
                    value={entry[k]}
                    onChange={(e) => change({ [k]: e.target.value })}
                  />
                </label>
              ))}
              <label className="field">
                当天装备（保存选择时的快照）
                <select
                  value={entry.equipment?.id || ""}
                  onChange={(e) =>
                    change({
                      equipment: structuredClone(
                        d.equipment.find((x) => x.id === e.target.value) ||
                          null,
                      ),
                    })
                  }
                >
                  <option value="">未选择装备</option>
                  {entry.equipment &&
                    !d.equipment.some((x) => x.id === entry.equipment?.id) && (
                      <option value={entry.equipment.id}>
                        历史快照 · {entry.equipment.name}
                      </option>
                    )}
                  {d.equipment.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name}
                    </option>
                  ))}
                </select>
              </label>
              {entry.equipment && (
                <p className="hint">
                  快照：{entry.equipment.board} · {entry.equipment.front}° /{" "}
                  {entry.equipment.rear}° · {entry.equipment.width}{" "}
                  cm。重新选择装备才更新快照。
                </p>
              )}
              <details>
                <summary>更多选填 · 时长、反馈、视频备注</summary>
                <Field
                  label="滑雪时长（分钟）"
                  type="number"
                  value={entry.minutes}
                  onChange={(v) => {
                    if (v === "" || Number(v) >= 0) change({ minutes: v });
                  }}
                />
                {(
                  [
                    ["coach", "教练反馈"],
                    ["body", "身体感受"],
                    ["gearFeel", "装备感受（如冻脚、脚跟松动）"],
                    ["video", "视频备注（时间 / 相册位置，不上传文件）"],
                  ] as const
                ).map(([k, l]) => (
                  <Field
                    key={k}
                    label={l}
                    value={entry[k]}
                    onChange={(v) => change({ [k]: v })}
                  />
                ))}
              </details>
              <p className="hint">
                在能力范围内练习，复杂地形与跳跃可寻求教练指导。完成练习不会自动更新技能自评。
              </p>
              <div className="form-actions">
                <button type="submit" className="primary">
                  保存到滑雪日记 ✓
                </button>
                <button
                  type="button"
                  className="text danger"
                  onClick={() => {
                    if (confirm("放弃当前草稿？已有日记不会被删除。")) {
                      update({ draft: null });
                      setEditing(false);
                      setEntry(null);
                    }
                  }}
                >
                  放弃草稿
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {current && (
        <div className="overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="技能自评"
          >
            <div className="row">
              <h2>{current.name}</h2>
              <button onClick={() => setSelected("")}>关闭</button>
            </div>
            <p>{current.description}</p>
            <p>
              <b>前置基础：</b>
              {current.prereq}
            </p>
            <h3>我的自评</h3>
            <div className="chips">
              {states.map((s) => (
                <button
                  className={assessment.state === s ? "active" : ""}
                  key={s}
                  onClick={() => assess({ state: s })}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="hint">由你确认状态；次数和练习完成标记不代表掌握。</p>
            <Field
              label="完成时的地形"
              value={assessment.terrain}
              onChange={(v) => assess({ terrain: v })}
            />
            <Field
              label="完成时的雪况"
              value={assessment.snow}
              onChange={(v) => assess({ snow: v })}
            />
            <Field
              label="个人备注"
              value={assessment.note}
              onChange={(v) => assess({ note: v })}
            />
            <h3>相关练习卡</h3>
            {cards
              .filter((c) => c.skillId === current.id)
              .map((c) => (
                <details key={c.id}>
                  <summary>{c.title}</summary>
                  <p>{c.purpose}</p>
                  <p>前置：{c.prereq}</p>
                  <p>地形：{c.terrain}</p>
                  <ol>
                    {c.steps.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ol>
                  <p>提示：{c.tips}</p>
                  <p>常见错误：{c.errors}</p>
                  <p>自查：{c.check}</p>
                </details>
              ))}
            {!cards.some((c) => c.skillId === current.id) && (
              <p>自定义技能可在当天记录中添加练习内容。</p>
            )}
            <h3>状态变化</h3>
            {assessment.history.length ? (
              assessment.history
                .slice()
                .reverse()
                .map((h, i) => (
                  <p key={i}>
                    {new Date(h.date).toLocaleString("zh-CN")} · {h.state}
                    {h.note && ` · ${h.note}`}
                  </p>
                ))
            ) : (
              <p>尚未更新自评。</p>
            )}
            <h3>历次相关日记</h3>
            {sorted
              .filter(
                (e) =>
                  e.goals.includes(current.id) ||
                  e.practices.some((p) => p.skillId === current.id),
              )
              .map((e) => (
                <button
                  className="history"
                  key={e.id}
                  onClick={() => {
                    setSelected("");
                    edit(e);
                  }}
                >
                  {e.date} · {e.resort} →
                </button>
              ))}
          </section>
        </div>
      )}
      {pending && (
        <div className="overlay">
          <section
            className="modal compact"
            role="alertdialog"
            aria-modal="true"
            aria-label="确认恢复备份"
          >
            <h2>恢复这个备份？</h2>
            <p>备份时间：{new Date(pending.date).toLocaleString("zh-CN")}</p>
            <p>
              {pending.data.entries.length} 篇日记 ·{" "}
              {pending.data.equipment.length} 套装备 ·{" "}
              {pending.data.customSkills.length} 个自定义技能
            </p>
            <p>
              确认后将替换此设备的全部雪迹数据，无法合并。建议先导出当前数据。
            </p>
            <button onClick={exportData}>先导出当前数据</button>
            <div className="row">
              <button
                className="primary"
                onClick={async () => {
                  try {
                    await queue.current;
                    await writeData(pending.data);
                    setData(pending.data);
                    setPending(null);
                    setEntry(null);
                    setEditing(false);
                    setSelected("");
                    setSaved("备份已恢复");
                    setError("");
                  } catch {
                    setError("恢复失败，原数据未替换，请检查存储空间。");
                  }
                }}
              >
                确认替换并恢复
              </button>
              <button onClick={() => setPending(null)}>取消</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
