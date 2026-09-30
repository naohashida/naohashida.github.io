"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import practiceJson from "./data/practice.json";
import tasksJson from "./data/tasks.json";

type View = "home" | "practice" | "assessment" | "submit" | "log" | "privacy";
type PracticeBlock = { type: "text" | "image" | "video"; content?: string; resName?: string };
type PracticeItem = {
  id: string;
  title: string;
  instruction: string;
  instruction2?: string;
  videoRaw?: string;
  textAsset?: string;
  image?: string;
  image2?: string;
  image3?: string;
  allowRecording?: boolean;
  showRecordingTime?: boolean;
  blocks?: PracticeBlock[];
};
type PracticeGroup = { id: string; title: string; items: PracticeItem[] };
type PracticeCategory = { id: string; title: string; groups: PracticeGroup[] };
type Task = { id: string; title: string; prompt: string; textAsset?: string; minDurationSec?: number };
type PracticeLog = {
  doneDates: string[];
  totalMs: number;
  todayMs: number;
  todayKey: string;
  items: Record<string, { title: string; totalMs: number }>;
};
type AssessmentResult = { target: string; candidates: string[]; correct: boolean };
type AssessmentSession = { date: string; correct: number; total: number; results: AssessmentResult[] };

const categories = (practiceJson as { categories: PracticeCategory[] }).categories;
const tasks = (tasksJson as { tasks: Task[] }).tasks;
const assessmentSounds = [
  "た", "だ", "に", "ひ", "み", "り", "び", "く", "る", "け", "て", "れ", "げ",
  "で", "と", "ご", "ど", "きゃ", "しゃ", "ちゃ", "じゃ", "しゅ", "じゅ", "きょ", "ちょ",
];
const imageExtensions: Record<string, string> = {
  ansei: "png", ansei_position: "jpg", bou: "jpg", hekomi: "jpg", k_sound_position: "jpg",
  ka: "png", osara: "jpg", r_sound_position: "jpg", ra: "png", relax: "jpg",
  s_sound_position: "jpg", saki: "jpg", t_chitsu_release: "jpg", t_chitsu_stop: "jpg",
  t_release: "jpg", t_stop: "jpg", ta: "png", ta2: "png", ti2: "png",
};
const defaultLog: PracticeLog = { doneDates: [], totalMs: 0, todayMs: 0, todayKey: "", items: {} };
const baseUrl = import.meta.env.BASE_URL || "/";
const assetUrl = (path: string) => `${baseUrl}${path.replace(/^\/+/, "")}`;

const todayKey = () => new Date().toLocaleDateString("sv-SE");
const formatMinutes = (ms: number) => (ms < 60_000 ? `${Math.max(0, Math.floor(ms / 1000))}秒` : `${Math.floor(ms / 60_000)}分`);

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; }
}

function normalizeJapanese(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s。、,.!！?？・ー～~]/g, "")
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function isMatch(candidate: string, target: string) {
  const heard = normalizeJapanese(candidate);
  const expected = normalizeJapanese(target);
  return heard === expected || heard.includes(expected);
}

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("articulation-training", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("recordings");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveAudio(key: string, blob: Blob) {
  const db = await openAudioDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("recordings", "readwrite");
    tx.objectStore("recordings").put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadAudio(key: string): Promise<Blob | undefined> {
  const db = await openAudioDb();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction("recordings").objectStore("recordings").get(key);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

async function removeAudio(key: string) {
  const db = await openAudioDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("recordings", "readwrite");
    tx.objectStore("recordings").delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function useAssetText(path?: string) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!path) { setText(""); return; }
    let live = true;
    fetch(assetUrl(`assets/${path}`)).then((r) => r.text()).then((value) => live && setText(value)).catch(() => setText(""));
    return () => { live = false; };
  }, [path]);
  return text;
}

function AudioRecorder({ storageKey, compact = false, onChange }: { storageKey: string; compact?: boolean; onChange?: (saved: boolean) => void }) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [status, setStatus] = useState("録音できます");
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);

  const setBlobUrl = useCallback((blob?: Blob) => {
    setAudioUrl((old) => { if (old) URL.revokeObjectURL(old); return blob ? URL.createObjectURL(blob) : ""; });
    onChange?.(Boolean(blob));
  }, [onChange]);

  useEffect(() => {
    let live = true;
    loadAudio(storageKey).then((blob) => { if (live && blob) { setBlobUrl(blob); setStatus("録音済み"); } }).catch(() => undefined);
    return () => { live = false; };
  }, [storageKey, setBlobUrl]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setElapsed(Date.now() - startedRef.current), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("このブラウザは録音に対応していません"); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) { await saveAudio(storageKey, blob); setBlobUrl(blob); setStatus("録音を保存しました"); }
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorder.start();
      recorderRef.current = recorder;
      streamRef.current = stream;
      startedRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      setStatus("録音中…");
    } catch { setStatus("マイクを許可すると録音できます"); }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function reset() {
    await removeAudio(storageKey);
    setBlobUrl(undefined);
    setElapsed(0);
    setStatus("録音を削除しました");
  }

  return (
    <div className={`recorder ${compact ? "recorder-compact" : ""}`}>
      <div className="recorder-status"><span className={recording ? "live-dot" : "status-dot"} />{status}{recording && <b>{Math.floor(elapsed / 1000)}秒</b>}</div>
      <div className="recorder-actions">
        {!recording ? <button className="button primary small" onClick={start}>● 録音開始</button> : <button className="button danger small" onClick={stop}>■ 録音停止</button>}
        {audioUrl && <audio controls src={audioUrl} preload="metadata" />}
        {audioUrl && <button className="text-button" onClick={reset}>取り直す</button>}
      </div>
    </div>
  );
}

function NavIcon({ name }: { name: View }) {
  return <span aria-hidden="true">{{ home: "⌂", practice: "あ", assessment: "◎", submit: "⇧", log: "▦", privacy: "i" }[name]}</span>;
}

const navItems: { id: View; label: string }[] = [
  { id: "home", label: "ホーム" }, { id: "practice", label: "発音練習" },
  { id: "assessment", label: "発音判定" }, { id: "submit", label: "課題提出" },
  { id: "log", label: "記録" }, { id: "privacy", label: "ご案内" },
];

function Dashboard({ userName, log, sessions, onGo }: { userName: string; log: PracticeLog; sessions: AssessmentSession[]; onGo: (view: View) => void }) {
  const streak = calculateStreak(log.doneDates);
  const latest = sessions[0];
  return (
    <section className="view dashboard-view">
      <div className="home-header">
        <div>
          <div className="eyebrow">ホーム</div>
          <h1>{userName ? `${userName}さん` : "発音練習"}</h1>
          <p>発音の練習をはじめましょう。</p>
        </div>
        <img src={assetUrl("app-icon.png")} alt="" />
      </div>
      <div className="home-menu">
        <button onClick={() => onGo("practice")}><span className="home-menu-icon">あ</span><div><b>発音練習</b><p>教材を選んで練習します</p></div><span>→</span></button>
        <button onClick={() => onGo("assessment")}><span className="home-menu-icon">◎</span><div><b>発音の判定</b><p>25音の聞こえ方を確認します</p></div><span>→</span></button>
        <button onClick={() => onGo("submit")}><span className="home-menu-icon">⇧</span><div><b>課題提出</b><p>5つの課題を録音します</p></div><span>→</span></button>
        <button onClick={() => onGo("log")}><span className="home-menu-icon">▦</span><div><b>カレンダー／ログ</b><p>練習の記録を確認します</p></div><span>→</span></button>
      </div>
      <h2 className="home-section-title">練習の記録</h2>
      <div className="summary-grid">
        <article className="metric-card"><span className="metric-label">連続練習</span><strong>{streak}<small>日</small></strong></article>
        <article className="metric-card"><span className="metric-label">練習した日</span><strong>{log.doneDates.length}<small>日</small></strong></article>
        <article className="metric-card"><span className="metric-label">学習時間</span><strong>{formatMinutes(log.totalMs)}</strong></article>
        <article className="metric-card"><span className="metric-label">最新の判定</span><strong>{latest ? `${Math.round((latest.correct / latest.total) * 100)}%` : "—"}</strong></article>
      </div>
    </section>
  );
}

function PracticeView({ onPractice }: { onPractice: (id: string, title: string, ms: number) => void }) {
  const [categoryId, setCategoryId] = useState(categories[0].id);
  const [selected, setSelected] = useState<{ group: PracticeGroup; index: number } | null>(null);
  const category = categories.find((item) => item.id === categoryId) || categories[0];
  if (selected) {
    return <PracticeDetail group={selected.group} index={selected.index} onIndex={(index) => setSelected({ ...selected, index })} onBack={() => setSelected(null)} onPractice={onPractice} />;
  }
  return (
    <section className="view">
      <div className="page-header"><div><div className="eyebrow">PRACTICE LIBRARY</div><h1>発音練習</h1><p>練習したい音や動きを選んでください。</p></div><div className="count-badge"><strong>76</strong><span>練習項目</span></div></div>
      <div className="category-tabs" role="tablist" aria-label="練習カテゴリ">
        {categories.map((item) => <button role="tab" aria-selected={item.id === categoryId} className={item.id === categoryId ? "active" : ""} onClick={() => setCategoryId(item.id)} key={item.id}>{item.title}</button>)}
      </div>
      <div className="practice-groups">
        {category.groups.map((group) => (
          <article className="practice-group" key={group.id}>
            <div className="group-header"><div><span>{category.title}</span><h2>{group.title}</h2></div><span>{group.items.length}項目</span></div>
            <div className="lesson-list">
              {group.items.map((item, index) => <button key={item.id} onClick={() => setSelected({ group, index })}><span className="lesson-number">{String(index + 1).padStart(2, "0")}</span><span className="lesson-title">{item.title}</span><span className="lesson-meta">{item.videoRaw ? "動画あり" : item.blocks?.some((b) => b.type === "image") ? "図解あり" : "練習"}</span><span className="round-arrow">→</span></button>)}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PracticeDetail({ group, index, onIndex, onBack, onPractice }: { group: PracticeGroup; index: number; onIndex: (index: number) => void; onBack: () => void; onPractice: (id: string, title: string, ms: number) => void }) {
  const item = group.items[index];
  const assetText = useAssetText(item.textAsset);
  const started = useRef(Date.now());
  useEffect(() => { started.current = Date.now(); return () => onPractice(item.id, item.title, Date.now() - started.current); }, [item.id, item.title, onPractice]);
  const blocks = item.blocks || [];
  return (
    <section className="view lesson-view">
      <button className="back-button" onClick={onBack}>← 一覧へ戻る</button>
      <div className="lesson-progress"><span style={{ width: `${((index + 1) / group.items.length) * 100}%` }} /></div>
      <div className="lesson-kicker">{group.title}　{index + 1} / {group.items.length}</div>
      <h1>{item.title}</h1>
      <div className="lesson-layout">
        <article className="lesson-content">
          {blocks.length ? blocks.map((block, blockIndex) => {
            const name = block.content || block.resName || "";
            if (block.type === "image") return <img className="instruction-image" src={assetUrl(`assets/images/${name}.${imageExtensions[name] || "jpg"}`)} alt={`${item.title}の説明図`} key={blockIndex} />;
            if (block.type === "video") return <video controls playsInline src={assetUrl(`assets/videos/${name}.mp4`)} key={blockIndex} />;
            return <div className="instruction-text" dangerouslySetInnerHTML={{ __html: name }} key={blockIndex} />;
          }) : <>
            <div className="instruction-text" dangerouslySetInnerHTML={{ __html: item.instruction }} />
            {assetText && <div className="reading-text">{assetText}</div>}
            {[item.image, item.image2, item.image3].filter(Boolean).map((name) => <img className="instruction-image" src={assetUrl(`assets/images/${name}.${imageExtensions[name!] || "jpg"}`)} alt={`${item.title}の説明図`} key={name} />)}
            {item.videoRaw && <video controls playsInline src={assetUrl(`assets/videos/${item.videoRaw}.mp4`)} />}
          </>}
        </article>
        <aside className="practice-panel"><span className="panel-label">自分の声を確認</span><h3>録音して聴いてみる</h3><p>お手本を意識して、ゆっくり発音しましょう。</p><AudioRecorder storageKey={`practice:${item.id}`} /></aside>
      </div>
      <div className="lesson-nav"><button className="button ghost" disabled={index === 0} onClick={() => onIndex(index - 1)}>← 前へ</button><button className="button primary" onClick={() => index < group.items.length - 1 ? onIndex(index + 1) : onBack()}>{index < group.items.length - 1 ? "次へ →" : "一覧へ戻る"}</button></div>
    </section>
  );
}

function AssessmentView({ onSaved }: { onSaved: (session: AssessmentSession) => void }) {
  const [sounds, setSounds] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("表示された音を、ひとつずつ発音します。");
  const [supported, setSupported] = useState(false);
  const finished = sounds.length > 0 && results.length === sounds.length;

  useEffect(() => {
    const scope = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSupported(Boolean(scope.SpeechRecognition || scope.webkitSpeechRecognition));
  }, []);

  function startAssessment() {
    setSounds([...assessmentSounds].sort(() => Math.random() - 0.5)); setIndex(0); setResults([]); setMessage("マイクを押して発音してください。");
  }

  function listen() {
    type RecognitionResult = { [index: number]: { transcript: string }; length: number };
    type RecognitionEvent = { results: { [index: number]: RecognitionResult } };
    type Recognition = { lang: string; interimResults: boolean; maxAlternatives: number; onresult: ((event: RecognitionEvent) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void };
    type RecognitionCtor = new () => Recognition;
    const scope = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Constructor = scope.SpeechRecognition || scope.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor();
    recognition.lang = "ja-JP"; recognition.interimResults = false; recognition.maxAlternatives = 10;
    recognition.onresult = (event) => {
      const alternatives = event.results[0];
      const candidates = Array.from({ length: alternatives.length }, (_, i) => alternatives[i].transcript);
      const target = sounds[index];
      const result = { target, candidates, correct: candidates.some((candidate) => isMatch(candidate, target)) };
      const next = [...results, result];
      setResults(next); setListening(false);
      if (index + 1 < sounds.length) { setIndex(index + 1); setMessage(result.correct ? "認識できました。次の音へ進みます。" : `「${candidates[0] || "認識なし"}」と聞こえました。次へ進みます。`); }
      else {
        const session = { date: new Date().toISOString(), correct: next.filter((item) => item.correct).length, total: next.length, results: next };
        onSaved(session); setMessage("判定が終了しました。お疲れさまでした。");
      }
    };
    recognition.onerror = () => { setListening(false); setMessage("うまく聞き取れませんでした。もう一度お試しください。"); };
    recognition.onend = () => setListening(false);
    setListening(true); setMessage("聞いています…"); recognition.start();
  }

  const correctCount = results.filter((result) => result.correct).length;
  return (
    <section className="view assessment-view">
      <div className="page-header"><div><div className="eyebrow">VOICE CHECK</div><h1>発音の判定</h1><p>音声認識を使って、25音の聞こえ方を確認します。</p></div></div>
      {!sounds.length ? <div className="assessment-intro"><div className="assessment-mark">◎</div><h2>声の現在地を確認しましょう</h2><p>結果は医療上の診断ではなく、練習のための目安です。静かな場所で、マイクの使用を許可してください。</p>{!supported && <div className="notice">このブラウザは音声判定に対応していません。ChromeまたはEdgeでお試しください。</div>}<button className="button primary" disabled={!supported} onClick={startAssessment}>判定をはじめる</button></div> : finished ? <div className="result-card"><span>今回の結果</span><strong>{Math.round((correctCount / results.length) * 100)}<small>%</small></strong><p>{results.length}音中 {correctCount}音を認識できました</p><div className="result-sounds">{results.map((result) => <span className={result.correct ? "ok" : "retry"} key={result.target}>{result.target}<small>{result.correct ? "○" : "△"}</small></span>)}</div><button className="button primary" onClick={startAssessment}>もう一度判定する</button></div> : <div className="assessment-stage"><div className="assessment-topline"><span>{index + 1} / {sounds.length}</span><div><i style={{ width: `${((index + 1) / sounds.length) * 100}%` }} /></div></div><p className="assessment-prompt">この音を発音してください</p><div className="target-sound">{sounds[index]}</div><button className={`listen-button ${listening ? "listening" : ""}`} onClick={listen} disabled={listening}><span>{listening ? "•••" : "●"}</span>{listening ? "聞いています" : "マイクを押して発音"}</button><p className="assessment-message">{message}</p></div>}
    </section>
  );
}

function TaskCard({ task, onChange }: { task: Task; onChange: (id: string, saved: boolean) => void }) {
  const assetText = useAssetText(task.textAsset);
  const handleChange = useCallback((saved: boolean) => onChange(task.id, saved), [onChange, task.id]);
  return <article className="task-card"><div className="task-head"><span>{task.title}</span><small>目安 {task.minDurationSec || 3}秒以上</small></div><h3>{task.prompt}</h3>{assetText && <div className="task-reading">{assetText}</div>}<AudioRecorder compact storageKey={`submit:${task.id}`} onChange={handleChange} /></article>;
}

function SubmitView({ userName }: { userName: string }) {
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [sharing, setSharing] = useState(false);
  const complete = tasks.every((task) => saved[task.id]);
  const update = useCallback((id: string, value: boolean) => setSaved((old) => old[id] === value ? old : ({ ...old, [id]: value })), []);

  async function share() {
    setSharing(true);
    const blobs = await Promise.all(tasks.map((task) => loadAudio(`submit:${task.id}`)));
    const files = blobs.map((blob, index) => new File([blob!], `${userName || "user"}_${tasks[index].id}.${blob!.type.includes("mp4") ? "m4a" : "webm"}`, { type: blob!.type }));
    const shareData = { title: "発音練習 課題提出", text: `${userName || "利用者"}さんの発音練習課題です。`, files };
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) await navigator.share(shareData);
      else {
        files.forEach((file) => { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
        window.location.href = `mailto:articul811@gmail.com?subject=${encodeURIComponent(`ArticulationTraining ${userName}`)}&body=${encodeURIComponent("ダウンロードした5件の録音ファイルをこのメールへ添付してください。")}`;
      }
    } finally { setSharing(false); }
  }
  return <section className="view"><div className="page-header"><div><div className="eyebrow">ASSIGNMENT</div><h1>課題提出</h1><p>5つの課題を録音し、まとめて共有します。</p></div><div className="count-badge"><strong>{Object.values(saved).filter(Boolean).length}</strong><span>/ {tasks.length} 録音済み</span></div></div><div className="notice">録音はこの端末内に保存されます。共有ボタンを押すまで外部には送信されません。</div><div className="tasks-grid">{tasks.map((task) => <TaskCard task={task} onChange={update} key={task.id} />)}</div><div className="submit-bar"><div><b>{complete ? "すべての録音が揃いました" : "すべて録音すると共有できます"}</b><span>対応端末では共有メニューが開きます。</span></div><button className="button primary" disabled={!complete || sharing} onClick={share}>{sharing ? "準備中…" : "5件をまとめて共有"}</button></div></section>;
}

function calculateStreak(dates: string[]) {
  const dateSet = new Set(dates); let count = 0; const current = new Date();
  while (dateSet.has(current.toLocaleDateString("sv-SE"))) { count += 1; current.setDate(current.getDate() - 1); }
  return count;
}

function LogView({ log, sessions }: { log: PracticeLog; sessions: AssessmentSession[] }) {
  const streak = calculateStreak(log.doneDates);
  const badges = [
    { label: "はじめの一歩", unlocked: log.doneDates.length >= 1 }, { label: "3日連続", unlocked: streak >= 3 },
    { label: "7日連続", unlocked: streak >= 7 }, { label: "合計10日", unlocked: log.doneDates.length >= 10 },
  ];
  return <section className="view"><div className="page-header"><div><div className="eyebrow">YOUR PROGRESS</div><h1>練習の記録</h1><p>小さな積み重ねを、見える形に。</p></div></div><div className="log-grid"><article className="streak-card"><span>現在の連続記録</span><strong>{streak}<small>日</small></strong><p>今日の練習も記録されます</p></article><article className="calendar-card"><div className="card-title"><h2>練習した日</h2><b>{log.doneDates.length}日</b></div><div className="date-cloud">{log.doneDates.length ? log.doneDates.slice().reverse().slice(0, 14).map((date) => <span key={date}>{date.replaceAll("-", "/")}</span>) : <p>練習を終えると、ここに日付が記録されます。</p>}</div></article><article className="time-card"><div className="card-title"><h2>項目別の学習時間</h2><b>合計 {formatMinutes(log.totalMs)}</b></div><div className="time-list">{Object.entries(log.items).sort((a, b) => b[1].totalMs - a[1].totalMs).slice(0, 8).map(([id, item]) => <div key={id}><span>{item.title}</span><i><em style={{ width: `${Math.min(100, (item.totalMs / Math.max(log.totalMs, 1)) * 100 * 2.5)}%` }} /></i><b>{formatMinutes(item.totalMs)}</b></div>)}{!Object.keys(log.items).length && <p>項目を開いて練習すると時間が記録されます。</p>}</div></article><article className="history-card"><div className="card-title"><h2>発音判定の履歴</h2><b>{sessions.length}回</b></div>{sessions.length ? sessions.slice(0, 5).map((session) => <div className="history-row" key={session.date}><span>{new Date(session.date).toLocaleDateString("ja-JP")}</span><b>{session.correct} / {session.total}</b><em>{Math.round((session.correct / session.total) * 100)}%</em></div>) : <p>判定を行うと結果が記録されます。</p>}</article></div><div className="badges"><div className="section-heading"><div><span>MILESTONES</span><h2>バッジ</h2></div></div><div>{badges.map((badge) => <span className={badge.unlocked ? "unlocked" : "locked"} key={badge.label}><i>{badge.unlocked ? "★" : "·"}</i>{badge.label}</span>)}</div></div></section>;
}

function PrivacyView() {
  return <section className="view policy-view"><div className="eyebrow">INFORMATION</div><h1>ご利用案内と<br />プライバシー</h1><div className="policy-lead">本アプリは、成人の発音学習と反復練習を支援する教育用Webアプリです。</div><div className="policy-grid"><article><span>01</span><h2>マイクの使用</h2><p>録音または発音判定を開始したときだけマイクを使用します。ブラウザから許可を求められた場合に、ご自身で選択できます。</p></article><article><span>02</span><h2>データの保存</h2><p>ユーザー名、練習履歴、判定履歴、録音音声は、このブラウザの端末内に保存されます。サーバーへ自動送信しません。</p></article><article><span>03</span><h2>課題の共有</h2><p>課題提出で共有操作を選んだ場合に限り、端末の共有機能またはメールを使って録音を送信できます。送信前に内容を確認できます。</p></article><article><span>04</span><h2>大切なお知らせ</h2><p>表示される判定は音声認識結果に基づく学習上の目安です。医療上の診断や治療を目的とするものではありません。</p></article></div><div className="contact-card"><div><span>CONTACT</span><h2>お問い合わせ</h2></div><a href="mailto:hashida1223@gmail.com">hashida1223@gmail.com →</a></div></section>;
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [userName, setUserName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [ready, setReady] = useState(false);
  const [log, setLog] = useState<PracticeLog>(defaultLog);
  const [sessions, setSessions] = useState<AssessmentSession[]>([]);

  useEffect(() => {
    setUserName(localStorage.getItem("articulation:user") || "");
    const savedLog = readJson("articulation:practice-log", defaultLog);
    if (savedLog.todayKey !== todayKey()) { savedLog.todayKey = todayKey(); savedLog.todayMs = 0; }
    setLog(savedLog); setSessions(readJson("articulation:assessments", [])); setReady(true);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(assetUrl("sw.js")).catch(() => undefined);
  }, []);

  const recordPractice = useCallback((id: string, title: string, ms: number) => {
    if (ms < 1000) return;
    setLog((previous) => {
      const today = todayKey(); const fresh = previous.todayKey === today ? previous : { ...previous, todayKey: today, todayMs: 0 };
      const next: PracticeLog = { ...fresh, doneDates: Array.from(new Set([...fresh.doneDates, today])).sort(), totalMs: fresh.totalMs + ms, todayMs: fresh.todayMs + ms, items: { ...fresh.items, [id]: { title, totalMs: (fresh.items[id]?.totalMs || 0) + ms } } };
      localStorage.setItem("articulation:practice-log", JSON.stringify(next)); return next;
    });
  }, []);

  function saveSession(session: AssessmentSession) {
    setSessions((old) => { const next = [session, ...old].slice(0, 50); localStorage.setItem("articulation:assessments", JSON.stringify(next)); return next; });
  }

  function confirmName() {
    const name = draftName.trim(); if (!name) return; localStorage.setItem("articulation:user", name); setUserName(name);
  }

  const title = useMemo(() => navItems.find((item) => item.id === view)?.label || "ホーム", [view]);
  if (!ready) return <main className="loading-screen">発音練習アプリを準備しています…</main>;
  return (
    <div className="app-shell">
      <header className="mobile-header"><button onClick={() => setView("home")}><img src={assetUrl("app-icon.png")} alt="" /><span>発音練習</span></button><b>{title}</b></header>
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("home")}><img src={assetUrl("app-icon.png")} alt="" /><span><b>発音練習</b><small>Articulation Training</small></span></button>
        <nav>{navItems.map((item) => <button className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} key={item.id}><NavIcon name={item.id} /><span>{item.label}</span></button>)}</nav>
        <div className="sidebar-foot"><span className="tiny-orb">あ</span><p>焦らず、少しずつ。<br />今日の声を大切に。</p></div>
      </aside>
      <main className="main-content">
        {view === "home" && <Dashboard userName={userName} log={log} sessions={sessions} onGo={setView} />}
        {view === "practice" && <PracticeView onPractice={recordPractice} />}
        {view === "assessment" && <AssessmentView onSaved={saveSession} />}
        {view === "submit" && <SubmitView userName={userName} />}
        {view === "log" && <LogView log={log} sessions={sessions} />}
        {view === "privacy" && <PrivacyView />}
      </main>
      <nav className="bottom-nav">{navItems.slice(0, 5).map((item) => <button className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} key={item.id}><NavIcon name={item.id} /><small>{item.label}</small></button>)}</nav>
      {!userName && <div className="onboarding-backdrop"><div className="onboarding"><img src={assetUrl("app-icon.png")} alt="発音練習アプリ" /><h1>発音練習アプリ</h1><p>練習記録をこの端末に保存するため、最初にお名前を設定してください。</p><label>お名前またはニックネーム<input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && confirmName()} placeholder="例：はしだ" /></label><button className="button primary" onClick={confirmName} disabled={!draftName.trim()}>はじめる</button><small>入力した名前はこの端末内だけに保存されます。</small></div></div>}
    </div>
  );
}
