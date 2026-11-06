"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import practiceJson from "./data/practice.json";
import tasksJson from "./data/tasks.json";
import clarityJson from "./data/clarity.json";
import dietGuidesJson from "./data/dietGuides.json";
import recipesJson from "./data/recipes.json";

type View =
  | "home" | "speech" | "meal" | "practice" | "assessment" | "acoustic" | "submit"
  | "log" | "mealGuidance" | "mealRecipe" | "mealRecord" | "settings" | "privacy";
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
  wordTest?: boolean;
  wordTestSet?: string;
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
type ClarityWord = { word: string; yomi: string; target: string; pos: number; accept: string[] };
type ClaritySet = {
  id: string; title: string; description: string;
  words: ClarityWord[];
  approxByTarget?: Record<string, string[]>;
};
type ClarityHistoryEntry = { setId: string; title: string; date: string; correctCount: number; totalCount: number };
type ClaritySession = { date: string; setId: string; title: string; results: { word: string; judge: string }[] };
type MealRecord = {
  id: string; date: string; mealType: string; dietCode: string;
  description: string; intakePercent: number; kcal: number; protein: number; notes: string;
};
type BrowserSpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: { transcript: string };
};
type BrowserSpeechRecognitionEvent = {
  readonly results: { readonly length: number; [index: number]: BrowserSpeechRecognitionResult };
};
type BrowserSpeechRecognitionPhrase = { readonly phrase: string; readonly boost: number };
type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  phrases?: BrowserSpeechRecognitionPhrase[];
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};

const categories = (practiceJson as { categories: PracticeCategory[] }).categories;
const tasks = (tasksJson as { tasks: Task[] }).tasks;
const claritySets = clarityJson as unknown as Record<string, ClaritySet>;
const dietGuides = dietGuidesJson as unknown as { code: string; name: string; form: string; example: string; tips: string }[];
const recipes = recipesJson as unknown as Record<string, { code: string; title: string; note: string; ingredients: string; steps: string }[]>;
const praiseFrogs = [
  "frog_praise_1", "frog_praise_2", "frog_praise_3", "frog_praise_4", "frog_praise_5",
];
const assessmentSounds = [
  "た", "だ", "に", "ひ", "み", "り", "び", "く", "る", "け", "て", "れ", "げ",
  "で", "と", "ご", "ど", "きゃ", "しゃ", "ちゃ", "じゃ", "しゅ", "じゅ", "きょ", "ちょ",
];
const assessmentAnswerAliases: Record<string, string[]> = {
  "た": ["た", "田", "多", "他", "太", "タ", "ター"],
  "だ": ["だ", "打", "ダ", "ダー"],
  "に": ["に", "二", "荷", "煮", "似", "兄", "ニ", "ニー", "2", "２"],
  "ひ": ["ひ", "日", "火", "非", "比", "陽", "ヒ", "ヒー"],
  "み": ["み", "見", "身", "実", "美", "三", "ミ", "ミー", "3", "３"],
  "り": ["り", "利", "理", "里", "李", "梨", "リ", "リー"],
  "び": ["び", "美", "尾", "微", "ビ", "ビー", "B", "b"],
  "く": ["く", "区", "句", "九", "苦", "久", "空", "食う", "ク", "クー", "9", "９"],
  "る": ["る", "留", "流", "ル", "ルー"],
  "け": ["け", "家", "毛", "気", "計", "系", "経", "ケ", "ケー"],
  "て": ["て", "手", "テ", "テー"],
  "れ": ["れ", "例", "礼", "零", "レ", "レー", "0", "０"],
  "げ": ["げ", "下", "芸", "ゲ", "ゲー"],
  "で": ["で", "出", "デ", "デー"],
  "と": ["と", "戸", "都", "斗", "十", "ト", "トー"],
  "ご": ["ご", "五", "語", "後", "碁", "号", "午後", "ゴ", "ゴー", "5", "５"],
  "ど": ["ど", "土", "度", "ド", "ドー"],
  "きゃ": ["きゃ", "きゃあ", "キャ", "キャー"],
  "しゃ": ["しゃ", "車", "社", "者", "写", "謝", "シャ", "シャー"],
  "ちゃ": ["ちゃ", "茶", "ちゃあ", "チャ", "チャー"],
  "じゃ": ["じゃ", "じゃあ", "ジャ", "ジャー"],
  "しゅ": ["しゅ", "しゅう", "主", "酒", "種", "朱", "州", "週", "シュ", "シュー"],
  "じゅ": ["じゅ", "じゅう", "十", "銃", "樹", "授", "柔", "ジュ", "ジューン", "ジュウ", "10", "１０"],
  "きょ": ["きょ", "きょう", "今日", "京", "教", "強", "協", "競", "鏡", "キョ", "キョー"],
  "ちょ": ["ちょ", "ちょう", "超", "町", "長", "蝶", "庁", "調", "チョ", "チョー"],
};
const assessmentBiasPhrases = Array.from(new Set([
  ...assessmentSounds,
  ...Object.values(assessmentAnswerAliases).flat(),
]));
const imageExtensions: Record<string, string> = {
  ansei: "png", ansei_position: "jpg", bou: "jpg", hekomi: "jpg", k_sound_position: "jpg",
  ka: "png", osara: "jpg", r_sound_position: "jpg", ra: "png", relax: "jpg",
  s_sound_position: "jpg", saki: "jpg", t_chitsu_release: "jpg", t_chitsu_stop: "jpg",
  t_release: "jpg", t_stop: "jpg", ta: "png", ta2: "png", ti2: "png",
};
const defaultLog: PracticeLog = { doneDates: [], totalMs: 0, todayMs: 0, todayKey: "", items: {} };
const baseUrl = import.meta.env.BASE_URL || "/";
const assetUrl = (path: string) => `${baseUrl}${path.replace(/^\/+/, "")}`;
const frogUrl = (name: string) => assetUrl(`frogs/${name}.png`);
const googlePlayUrl = "https://play.google.com/store/apps/details?id=jp.hashida.articulationtraining&hl=ja";

const todayKey = () => new Date().toLocaleDateString("sv-SE");
const formatMinutes = (ms: number) => (ms < 60_000 ? `${Math.max(0, Math.floor(ms / 1000))}秒` : `${Math.floor(ms / 60_000)}分`);

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; }
}

function normalizeJapanese(value: string) {
  return value.normalize("NFKC").toLowerCase()
    .replaceAll("10", "じゅう").replaceAll("0", "れい").replaceAll("2", "に")
    .replaceAll("3", "み").replaceAll("5", "ご").replaceAll("9", "く")
    .replace(/[\s\u3000、。,.!！?？・ー～~-]/g, "")
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function isMatch(candidate: string, target: string) {
  const heard = normalizeJapanese(candidate);
  if (!heard) return false;
  const answers = [...(assessmentAnswerAliases[target] || []), target]
    .map(normalizeJapanese)
    .filter(Boolean);
  return answers.some((answer) => heard === answer || heard.includes(answer) || answer.includes(heard));
}

// ---------------- 単語明瞭度テスト判定（Android版 WordClarityTest.kt と同じ規則） ----------------

const dakutenRemovedMap: Record<string, string> = {
  "が": "か", "ぎ": "き", "ぐ": "く", "げ": "け", "ご": "こ",
  "ざ": "さ", "じ": "し", "ず": "す", "ぜ": "せ", "ぞ": "そ",
  "だ": "た", "ぢ": "ち", "づ": "つ", "で": "て", "ど": "と",
  "ば": "は", "び": "ひ", "ぶ": "ふ", "べ": "へ", "ぼ": "ほ",
  "ぱ": "は", "ぴ": "ひ", "ぷ": "ふ", "ぺ": "へ", "ぽ": "ほ",
  "ヴ": "ぶ",
};

function toClarityNormalized(value: string): string {
  let s = value.trim()
    .replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  s = s.replace(/[\s\u3000、。,.!?！？「」『』・'"()（）〜ー\-−~]/g, "");
  for (let i = 0; i < 2; i += 1) {
    s = s.replaceAll("えい", "え").replaceAll("おう", "お").replaceAll("おお", "お");
  }
  s = s.split("").map((ch) => dakutenRemovedMap[ch] || ch).join("");
  return s;
}

const smallKana = new Set(["ゃ", "ゅ", "ょ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ"]);

function toMorae(value: string): string[] {
  const morae: string[] = [];
  for (const ch of value) {
    if (smallKana.has(ch) && morae.length) morae[morae.length - 1] += ch;
    else morae.push(ch);
  }
  return morae;
}

function withoutLeadingPrefix(value: string): string {
  return value.length >= 2 && (value.startsWith("お") || value.startsWith("ご")) ? value.slice(1) : value;
}

function moraEditDistance(a: string[], b: string[]): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1);
    }
  }
  return dp[a.length][b.length];
}

function targetMoraIndices(refMorae: string[], word: ClarityWord): number[] {
  if (word.pos >= 1 && word.pos <= refMorae.length) return [word.pos - 1];
  return refMorae.map((mora, index) => mora.startsWith(word.target) ? index : -1).filter((i) => i >= 0);
}

function moraeEquivalentAtTarget(refMora: string, candMora: string, set: ClaritySet): boolean {
  const h1 = refMora[0];
  const h2 = candMora[0];
  if (h1 === h2) return true;
  const approx = set.approxByTarget?.[h1];
  return Boolean(approx && approx.includes(h2));
}

function targetMoraePreserved(refNorm: string, candNorm: string, word: ClarityWord, set: ClaritySet): boolean {
  const a = toMorae(refNorm);
  const b = toMorae(candNorm);
  if (Math.abs(a.length - b.length) > 1) return false;
  if (moraEditDistance(a, b) > 1) return false;
  if (a.join("") === b.join("")) return true;
  const targets = new Set(targetMoraIndices(a, word));

  const moraOk = (p: number, candMora: string | undefined): boolean => {
    if (candMora === undefined) return false;
    return targets.has(p) ? moraeEquivalentAtTarget(a[p], candMora, set) : candMora === a[p];
  };

  if (a.length === b.length) {
    return a.every((_, p) => moraOk(p, b[p]));
  }
  if (b.length === a.length + 1) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i += 1;
    return a.every((_, p) => moraOk(p, b[p < i ? p : p + 1]));
  }
  let i = 0;
  while (i < b.length && a[i] === b[i]) i += 1;
  if (targets.has(i)) return false;
  return a.every((_, p) => p === i || moraOk(p, b[p < i ? p : p - 1]));
}

function judgeClarityWord(rawCandidates: string[], word: ClarityWord, set: ClaritySet): "correct" | "acceptable" | "incorrect" {
  const refs = Array.from(new Set(
    [word.word, word.yomi, ...word.accept]
      .map((value) => toClarityNormalized(value))
      .filter(Boolean)
  ));
  const refVariants = Array.from(new Set([...refs, ...refs.map(withoutLeadingPrefix)]));

  for (const raw of rawCandidates) {
    const candBase = toClarityNormalized(raw);
    if (!candBase) continue;
    const candVariants = Array.from(new Set([candBase, withoutLeadingPrefix(candBase)]));
    if (candVariants.some((cand) => refVariants.includes(cand))) return "correct";
    if (candVariants.some((cand) => refVariants.some((ref) => targetMoraePreserved(ref, cand, word, set)))) {
      return "acceptable";
    }
  }
  return "incorrect";
}

export { judgeClarityWord, toClarityNormalized, toMorae };

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

// ---------------- 褒めポップアップ（ランダムなカエル＋お疲れ様！） ----------------

function PraisePopup({ show, onClose }: { show: boolean; onClose: () => void }) {
  const frog = useRef(praiseFrogs[Math.floor(Math.random() * praiseFrogs.length)]);
  useEffect(() => {
    if (!show) return;
    frog.current = praiseFrogs[Math.floor(Math.random() * praiseFrogs.length)];
    const timer = window.setTimeout(onClose, 2600);
    return () => window.clearTimeout(timer);
  }, [show, onClose]);
  if (!show) return null;
  return (
    <div className="praise-backdrop" onClick={onClose} role="dialog" aria-label="お疲れ様">
      <div className="praise-card">
        <img src={frogUrl(frog.current)} alt="" />
        <b className="praise-title">お疲れ様！</b>
        <span>よくがんばりました！</span>
      </div>
    </div>
  );
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
  return <span aria-hidden="true">{{ home: "⌂", speech: "あ", meal: "🍚", practice: "あ", assessment: "◎", acoustic: "〜", submit: "⇧", log: "▦", mealGuidance: "📋", mealRecipe: "🥣", mealRecord: "📝", settings: "⚙", privacy: "i" }[name]}</span>;
}

const navItems: { id: View; label: string }[] = [
  { id: "home", label: "ホーム" }, { id: "speech", label: "発音" },
  { id: "meal", label: "食事" }, { id: "log", label: "カレンダー／ログ" },
  { id: "settings", label: "設定" }, { id: "privacy", label: "ご案内" },
];

function AndroidDownloadLink({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`android-download${compact ? " compact" : ""}`} href={googlePlayUrl} target="_blank" rel="noreferrer">
      <span className="android-download-icon" aria-hidden="true">▶</span>
      <span className="android-download-copy">
        <b>Androidをお使いの方へ</b>
        <small>Google PlayからAndroidアプリ版をダウンロードできます</small>
      </span>
      <strong>Google Playで開く →</strong>
    </a>
  );
}

// ---------------- ホーム（4セクション＋カエル） ----------------

function Dashboard({ userName, log, sessions, clarityLog, onGo, onPraise }: {
  userName: string; log: PracticeLog; sessions: AssessmentSession[];
  clarityLog: ClarityHistoryEntry[]; onGo: (view: View) => void; onPraise: () => void;
}) {
  const streak = calculateStreak(log.doneDates);
  const latest = sessions[0];
  const latestClarity = clarityLog[0];
  return (
    <section className="view dashboard-view">
      <div className="home-hero">
        <img className="home-mascot" src={frogUrl("frog_mascot")} alt="" />
        <div>
          <div className="eyebrow">ホーム</div>
          <h1>{userName ? `${userName}さん、こんにちは` : "発音練習・食事の自己管理"}</h1>
          <p>やりたいことを選んでください。</p>
        </div>
      </div>
      <div className="home-menu">
        <button className="section-card speech" onClick={() => onGo("speech")}>
          <img src={frogUrl("frog_speech")} alt="" />
          <div><b>発音</b><p>課題提出・発音の判定・F2・tVSA音響評価・発音練習</p></div><span>→</span>
        </button>
        <button className="section-card meal" onClick={() => onGo("meal")}>
          <img src={frogUrl("frog_meal")} alt="" />
          <div><b>食事</b><p>嚥下調整食のガイダンス・レシピ・食事記録</p></div><span>→</span>
        </button>
        <button className="section-card log" onClick={() => onGo("log")}>
          <img src={frogUrl("frog_log")} alt="" />
          <div><b>カレンダー／ログ</b><p>練習と食事の記録を確認します</p></div><span>→</span>
        </button>
        <button className="section-card settings" onClick={() => onGo("settings")}>
          <img src={frogUrl("frog_settings")} alt="" />
          <div><b>設定</b><p>お名前の変更など</p></div><span>→</span>
        </button>
      </div>
      <h2 className="home-section-title">最近の記録</h2>
      <div className="summary-grid">
        <article className="metric-card"><span className="metric-label">連続練習</span><strong>{streak}<small>日</small></strong></article>
        <article className="metric-card"><span className="metric-label">練習した日</span><strong>{log.doneDates.length}<small>日</small></strong></article>
        <article className="metric-card"><span className="metric-label">最新の発音判定</span><strong>{latest ? `${Math.round((latest.correct / latest.total) * 100)}%` : "—"}</strong></article>
        <article className="metric-card">
          <span className="metric-label">最新の単語テスト</span>
          <strong>{latestClarity ? `${latestClarity.correctCount}/${latestClarity.totalCount}` : "—"}</strong>
          {latestClarity && <p>{latestClarity.title}</p>}
        </article>
      </div>
      <button className="link-with-frog" onClick={onPraise}>
        <img src={frogUrl("frog_praise_1")} alt="" />カエルさんに「お疲れ様」って言ってもらう
      </button>
      <AndroidDownloadLink />
    </section>
  );
}

function SpeechSectionView({ onGo }: { onGo: (view: View) => void }) {
  const items: { view: View; title: string; desc: string; frog: string }[] = [
    { view: "submit", title: "課題提出", desc: "5つの課題を録音して共有します", frog: "frog_praise_2" },
    { view: "assessment", title: "発音の判定", desc: "25音の聞こえ方を確認します", frog: "frog_praise_1" },
    { view: "acoustic", title: "F2・tVSA音響評価", desc: "母音のフォルマントを測ります（目安）", frog: "frog_speech" },
    { view: "practice", title: "発音練習", desc: "教材を選んで練習します", frog: "frog_praise_4" },
  ];
  return (
    <section className="view section-view">
      <div className="page-header">
        <div><div className="eyebrow">SPEECH</div><h1>発音</h1><p>発音に関するメニューです。</p></div>
        <img className="section-mascot" src={frogUrl("frog_speech_header")} alt="" />
      </div>
      <div className="section-menu">
        {items.map((item) => (
          <button key={item.view} onClick={() => onGo(item.view)}>
            <img src={frogUrl(item.frog)} alt="" />
            <div><b>{item.title}</b><p>{item.desc}</p></div><span>→</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MealSectionView({ onGo }: { onGo: (view: View) => void }) {
  const items: { view: View; title: string; desc: string; frog: string }[] = [
    { view: "mealGuidance", title: "嚥下調整食のガイダンス", desc: "嚥下調整食分類2021の説明", frog: "frog_meal_header" },
    { view: "mealRecipe", title: "嚥下調整食レシピ", desc: "主食・主菜・副菜のレシピ集", frog: "frog_praise_5" },
    { view: "mealRecord", title: "食事記録", desc: "食事の内容と摂取率を記録します", frog: "frog_meal" },
  ];
  return (
    <section className="view section-view">
      <div className="page-header">
        <div><div className="eyebrow">MEAL</div><h1>食事</h1><p>食事に関するメニューです。</p></div>
        <img className="section-mascot" src={frogUrl("frog_meal_header")} alt="" />
      </div>
      <div className="notice">写真を使ったAI解析・筋肉量推定は、Androidアプリ版でご利用ください。</div>
      <div className="section-menu">
        {items.map((item) => (
          <button key={item.view} onClick={() => onGo(item.view)}>
            <img src={frogUrl(item.frog)} alt="" />
            <div><b>{item.title}</b><p>{item.desc}</p></div><span>→</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------------- 発音練習（wordTest対応） ----------------

function PracticeView({ onPractice, onPraise }: { onPractice: (id: string, title: string, ms: number) => void; onPraise: () => void }) {
  const [categoryId, setCategoryId] = useState(categories[0].id);
  const [selected, setSelected] = useState<{ group: PracticeGroup; index: number } | null>(null);
  const category = categories.find((item) => item.id === categoryId) || categories[0];
  if (selected) {
    return <PracticeDetail group={selected.group} index={selected.index} onIndex={(index) => setSelected({ ...selected, index })} onBack={() => { onPraise(); setSelected(null); }} onPractice={onPractice} onPraise={onPraise} />;
  }
  return (
    <section className="view">
      <div className="page-header"><div><div className="eyebrow">PRACTICE LIBRARY</div><h1>発音練習</h1><p>練習したい音や動きを選んでください。</p></div><div className="count-badge"><strong>80</strong><span>練習項目</span></div></div>
      <div className="category-tabs" role="tablist" aria-label="練習カテゴリ">
        {categories.map((item) => <button role="tab" aria-selected={item.id === categoryId} className={item.id === categoryId ? "active" : ""} onClick={() => setCategoryId(item.id)} key={item.id}>{item.title}</button>)}
      </div>
      <div className="practice-groups">
        {category.groups.map((group) => (
          <article className="practice-group" key={group.id}>
            <div className="group-header"><div><span>{category.title}</span><h2>{group.title}</h2></div><span>{group.items.length}項目</span></div>
            <div className="lesson-list">
              {group.items.map((item, index) => <button key={item.id} onClick={() => setSelected({ group, index })}><span className="lesson-number">{String(index + 1).padStart(2, "0")}</span><span className="lesson-title">{item.title}</span><span className="lesson-meta">{item.wordTest ? "単語テスト" : item.videoRaw ? "動画あり" : item.blocks?.some((b) => b.type === "image") ? "図解あり" : "練習"}</span><span className="round-arrow">→</span></button>)}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PracticeDetail({ group, index, onIndex, onBack, onPractice, onPraise }: { group: PracticeGroup; index: number; onIndex: (index: number) => void; onBack: () => void; onPractice: (id: string, title: string, ms: number) => void; onPraise: () => void }) {
  const item = group.items[index];
  const assetText = useAssetText(item.textAsset);
  const started = useRef(Date.now());
  useEffect(() => { started.current = Date.now(); return () => onPractice(item.id, item.title, Date.now() - started.current); }, [item.id, item.title, onPractice]);
  if (item.wordTest) {
    const set = claritySets[item.wordTestSet || "ta"] || claritySets.ta;
    return <WordClarityTestView set={set} onBack={onBack} onFinished={onPraise} />;
  }
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

// ---------------- 単語明瞭度テスト ----------------

function WordClarityTestView({ set, onBack, onFinished }: { set: ClaritySet; onBack: () => void; onFinished: () => void }) {
  const [questions, setQuestions] = useState<ClarityWord[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ word: ClarityWord; judge: string }[]>([]);
  const [listening, setListening] = useState(false);
  const [needsRetry, setNeedsRetry] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("テスト開始を押してください。");
  const [supported, setSupported] = useState(false);
  const [history, setHistory] = useState<ClaritySession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const qRef = useRef<ClarityWord[]>([]);
  const iRef = useRef(0);
  const rRef = useRef<{ word: ClarityWord; judge: string }[]>([]);
  const listeningRef = useRef(false);
  const partialRef = useRef<string[]>([]);
  const detectedRef = useRef(false);
  const retryRef = useRef(0);
  const resolvedRef = useRef(true);
  const recRef = useRef<BrowserSpeechRecognition | null>(null);
  const finished = questions.length > 0 && results.length === questions.length;

  useEffect(() => {
    const scope = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSupported(Boolean(scope.SpeechRecognition || scope.webkitSpeechRecognition));
    setHistory(readJson<ClaritySession[]>("articulation:clarity:" + set.id, []));
  }, [set.id]);

  function startTest() {
    const shuffled = [...set.words];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    qRef.current = shuffled.slice(0, 10);
    iRef.current = 0;
    rRef.current = [];
    retryRef.current = 0;
    resolvedRef.current = true;
    setQuestions(qRef.current);
    setIndex(0);
    setResults([]);
    setShowHistory(false);
    setNeedsRetry(false);
    setAttempt((v) => v + 1);
    setMessage("表示されたことばを発音してください。自動で録音を開始します。");
  }

  const recordResult = useCallback((candidates: string[]) => {
    const word = qRef.current[iRef.current];
    if (!word) return;
    resolvedRef.current = true;
    listeningRef.current = false;
    setListening(false);
    setNeedsRetry(false);
    partialRef.current = [];
    detectedRef.current = false;
    retryRef.current = 0;
    const judge = judgeClarityWord(candidates, word, set);
    const next = [...rRef.current, { word, judge }];
    rRef.current = next;
    setResults(next);
    if (iRef.current >= qRef.current.length - 1) {
      const session: ClaritySession = {
        date: new Date().toISOString(), setId: set.id, title: set.title,
        results: next.map((r) => ({ word: r.word.word, judge: r.judge })),
      };
      setHistory((old) => { const updated = [session, ...old].slice(0, 50); localStorage.setItem("articulation:clarity:" + set.id, JSON.stringify(updated)); return updated; });
      setMessage("テストが終了しました。");
      onFinished();
    } else {
      iRef.current += 1;
      setIndex(iRef.current);
      setMessage(judge === "incorrect" ? "不正答として記録し、次のことばへ進みます。" : "次のことばへ進みます。");
    }
  }, [onFinished, set]);

  const markRetry = useCallback((msg: string) => {
    resolvedRef.current = true;
    listeningRef.current = false;
    setListening(false);
    setNeedsRetry(true);
    partialRef.current = [];
    detectedRef.current = false;
    setMessage(msg);
  }, []);

  const retryNoRecognition = useCallback(() => {
    resolvedRef.current = true;
    listeningRef.current = false;
    setListening(false);
    partialRef.current = [];
    detectedRef.current = false;
    if (retryRef.current < 1) {
      retryRef.current += 1;
      setNeedsRetry(false);
      setMessage("認識結果が取れませんでした。もう一度自動で録音します。");
      setAttempt((v) => v + 1);
    } else {
      recordResult([]);
    }
  }, [recordResult]);

  const listen = useCallback(() => {
    if (listeningRef.current || !qRef.current.length) return;
    type RecognitionCtor = new () => BrowserSpeechRecognition;
    const scope = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Constructor = scope.SpeechRecognition || scope.webkitSpeechRecognition;
    if (!Constructor) { markRetry("このブラウザでは音声認識を利用できません。"); return; }
    const recognition = new Constructor();
    recRef.current = recognition;
    partialRef.current = [];
    detectedRef.current = false;
    resolvedRef.current = false;
    listeningRef.current = true;
    setListening(true);
    setNeedsRetry(false);
    setMessage("マイクの準備をしています…");
    recognition.lang = "ja-JP";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 10;
    recognition.onresult = (event) => {
      if (resolvedRef.current) return;
      const candidates: string[] = [];
      let hasFinal = false;
      for (let ri = 0; ri < event.results.length; ri += 1) {
        const alts = event.results[ri];
        if (alts.isFinal) hasFinal = true;
        for (let ai = 0; ai < alts.length; ai += 1) {
          const t = alts[ai].transcript.trim();
          if (t) candidates.push(t);
        }
      }
      if (candidates.length) {
        partialRef.current = Array.from(new Set([...partialRef.current, ...candidates]));
        setMessage(hasFinal ? "判定中です。" : "音声を認識中です。");
      }
      if (hasFinal) recordResult(partialRef.current);
    };
    recognition.onerror = (event) => {
      if (resolvedRef.current || event.error === "aborted") return;
      if (event.error === "no-speech" || event.error === "no-match") {
        if (partialRef.current.length) recordResult(partialRef.current);
        else if (detectedRef.current) retryNoRecognition();
        else markRetry("音声を検出できませんでした。もう一度録音してください。");
        return;
      }
      markRetry("音声認識エラーです。もう一度試してください。");
    };
    recognition.onend = () => {
      if (resolvedRef.current) return;
      if (partialRef.current.length) recordResult(partialRef.current);
      else if (detectedRef.current) retryNoRecognition();
      else markRetry("音声を検出できませんでした。もう一度録音してください。");
    };
    recognition.onspeechstart = () => { detectedRef.current = true; };
    try { recognition.start(); } catch { markRetry("音声認識を開始できませんでした。"); }
  }, [markRetry, recordResult, retryNoRecognition]);

  useEffect(() => {
    if (!questions.length || finished || listening || needsRetry) return;
    const timer = window.setTimeout(() => listen(), 500);
    return () => window.clearTimeout(timer);
  }, [attempt, finished, index, listen, listening, needsRetry, questions.length]);

  useEffect(() => () => { resolvedRef.current = true; recRef.current?.abort(); }, []);

  const correct = results.filter((r) => r.judge !== "incorrect").length;
  return (
    <section className="view lesson-view">
      <button className="back-button" onClick={onBack}>← 一覧へ戻る</button>
      <h1>{set.title}</h1>
      <div className="wordtest-stage">
        {!questions.length ? (
          <div className="assessment-intro">
            <h2>{set.title}</h2>
            <p>{set.description}</p>
            {!supported && <div className="notice">このブラウザは音声認識に対応していません。ChromeまたはEdgeでお試しください。</div>}
            <div className="wordtest-buttons">
              <button className="button primary" disabled={!supported} onClick={startTest}>テストを始める</button>
              {history.length > 0 && <button className="button ghost" onClick={() => setShowHistory(true)}>過去の結果を見る</button>}
            </div>
          </div>
        ) : finished ? (
          <div className="result-card">
            <span>今回の結果</span>
            <strong>{correct}<small>/ {results.length} 正答</small></strong>
            <p>※正答には許容範囲の回答を含みます。</p>
            <div className="result-sounds">
              {results.map((r, i) => <span className={r.judge === "incorrect" ? "retry" : "ok"} key={i}>{r.word.word}<small>{r.judge === "correct" ? "○" : r.judge === "acceptable" ? "△" : "×"}</small></span>)}
            </div>
            <div className="wordtest-buttons">
              <button className="button primary" onClick={startTest}>もう一度</button>
              <button className="button ghost" onClick={onBack}>一覧へ戻る</button>
            </div>
          </div>
        ) : (
          <div className="assessment-stage">
            <div className="assessment-topline"><span>{index + 1} / {questions.length}</span><div><i style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div></div>
            <p className="assessment-prompt">このことばを発音してください</p>
            <div className="target-word">{questions[index].word}</div>
            <button className={`listen-button ${listening ? "listening" : ""}`} onClick={() => { retryRef.current = 0; listen(); }} disabled={listening || !needsRetry}>
              <span>●</span>{listening ? "聞いています" : needsRetry ? "もう一度録音" : "自動録音を準備中"}
            </button>
            <p className="assessment-message">{message}</p>
          </div>
        )}
        {showHistory && history.length > 0 && (
          <div className="history-panel">
            <div className="card-title"><h2>過去の結果</h2><button className="text-button" onClick={() => setShowHistory(false)}>閉じる</button></div>
            {history.map((h, i) => {
              const c = h.results.filter((r) => r.judge !== "incorrect").length;
              return <div className="history-row" key={i}><span>{new Date(h.date).toLocaleString("ja-JP")}</span><b>{c} / {h.results.length} 正答</b><em>{h.title}</em></div>;
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------- 発音の判定（25音・従来どおり） ----------------

function AssessmentView({ onSaved, onFinished }: { onSaved: (session: AssessmentSession) => void; onFinished: () => void }) {
  const [sounds, setSounds] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<AssessmentResult[]>([]);
  const [listening, setListening] = useState(false);
  const [recognitionReady, setRecognitionReady] = useState(false);
  const [needsRetry, setNeedsRetry] = useState(false);
  const [attemptVersion, setAttemptVersion] = useState(0);
  const [message, setMessage] = useState("表示された音を、ひとつずつ発音します。");
  const [supported, setSupported] = useState(false);
  const soundsRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const resultsRef = useRef<AssessmentResult[]>([]);
  const listeningRef = useRef(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const partialCandidatesRef = useRef<string[]>([]);
  const detectedSpeechRef = useRef(false);
  const retryCountRef = useRef(0);
  const contextualBiasEnabledRef = useRef(true);
  const attemptResolvedRef = useRef(true);
  const noResultTimerRef = useRef<number | null>(null);
  const finished = sounds.length > 0 && results.length === sounds.length;

  useEffect(() => {
    const scope = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSupported(Boolean(scope.SpeechRecognition || scope.webkitSpeechRecognition));
  }, []);

  const clearNoResultTimer = useCallback(() => {
    if (noResultTimerRef.current !== null) {
      window.clearTimeout(noResultTimerRef.current);
      noResultTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    attemptResolvedRef.current = true;
    clearNoResultTimer();
    recognitionRef.current?.abort();
  }, [clearNoResultTimer]);

  function startAssessment() {
    const shuffled = [...assessmentSounds];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    soundsRef.current = shuffled;
    indexRef.current = 0;
    resultsRef.current = [];
    retryCountRef.current = 0;
    partialCandidatesRef.current = [];
    detectedSpeechRef.current = false;
    attemptResolvedRef.current = true;
    setSounds(shuffled);
    setIndex(0);
    setResults([]);
    setRecognitionReady(false);
    setNeedsRetry(false);
    setAttemptVersion((value) => value + 1);
    setMessage("表示された音を発音してください。自動で録音を開始します。");
  }

  const recordResult = useCallback((candidates: string[]) => {
    const target = soundsRef.current[indexRef.current];
    if (!target) return;
    attemptResolvedRef.current = true;
    clearNoResultTimer();
    listeningRef.current = false;
    setListening(false);
    setRecognitionReady(false);
    setNeedsRetry(false);
    partialCandidatesRef.current = [];
    detectedSpeechRef.current = false;
    retryCountRef.current = 0;

    const result = { target, candidates, correct: candidates.some((candidate) => isMatch(candidate, target)) };
    const next = [...resultsRef.current, result];
    resultsRef.current = next;
    setResults(next);

    if (indexRef.current >= soundsRef.current.length - 1) {
      const session = { date: new Date().toISOString(), correct: next.filter((item) => item.correct).length, total: next.length, results: next };
      onSaved(session);
      setMessage("判定が終了しました。お疲れさまでした。");
      onFinished();
    } else {
      indexRef.current += 1;
      setIndex(indexRef.current);
      setMessage(result.correct ? "認識できました。次の音へ進みます。" : `「${candidates[0] || "認識なし"}」として記録し、次の音へ進みます。`);
    }
  }, [clearNoResultTimer, onFinished, onSaved]);

  const markRetry = useCallback((retryMessage: string) => {
    attemptResolvedRef.current = true;
    clearNoResultTimer();
    listeningRef.current = false;
    setListening(false);
    setRecognitionReady(false);
    setNeedsRetry(true);
    partialCandidatesRef.current = [];
    detectedSpeechRef.current = false;
    setMessage(retryMessage);
  }, [clearNoResultTimer]);

  const retryNoRecognition = useCallback(() => {
    attemptResolvedRef.current = true;
    clearNoResultTimer();
    listeningRef.current = false;
    setListening(false);
    setRecognitionReady(false);
    partialCandidatesRef.current = [];
    detectedSpeechRef.current = false;
    if (retryCountRef.current < 1) {
      retryCountRef.current += 1;
      setNeedsRetry(false);
      setMessage("認識結果が取れませんでした。もう一度自動で録音します。");
      setAttemptVersion((value) => value + 1);
    } else {
      recordResult([]);
    }
  }, [clearNoResultTimer, recordResult]);

  const listen = useCallback((resetRetryCount = false) => {
    if (listeningRef.current || !soundsRef.current.length) return;
    type RecognitionCtor = new () => BrowserSpeechRecognition;
    type RecognitionPhraseCtor = new (phrase: string, boost?: number) => BrowserSpeechRecognitionPhrase;
    const scope = window as unknown as {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
      SpeechRecognitionPhrase?: RecognitionPhraseCtor;
      webkitSpeechRecognitionPhrase?: RecognitionPhraseCtor;
    };
    const Constructor = scope.SpeechRecognition || scope.webkitSpeechRecognition;
    if (!Constructor) {
      markRetry("このブラウザでは音声認識を利用できません。");
      return;
    }

    const recognition = new Constructor();
    recognitionRef.current = recognition;
    if (resetRetryCount) retryCountRef.current = 0;
    partialCandidatesRef.current = [];
    detectedSpeechRef.current = false;
    attemptResolvedRef.current = false;
    listeningRef.current = true;
    setListening(true);
    setRecognitionReady(false);
    setNeedsRetry(false);
    setMessage("マイクを準備しています。少しお待ちください。");

    const beginNoResultTimer = () => {
      detectedSpeechRef.current = true;
      clearNoResultTimer();
      noResultTimerRef.current = window.setTimeout(() => {
        if (attemptResolvedRef.current || partialCandidatesRef.current.length) return;
        attemptResolvedRef.current = true;
        recognition.abort();
        recordResult([]);
      }, 5000);
    };

    recognition.lang = "ja-JP";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 10;
    const PhraseConstructor = scope.SpeechRecognitionPhrase || scope.webkitSpeechRecognitionPhrase;
    let contextualBiasApplied = false;
    if (contextualBiasEnabledRef.current && "phrases" in recognition && PhraseConstructor) {
      try {
        recognition.phrases = assessmentBiasPhrases.map((phrase) => new PhraseConstructor(phrase, 4));
        contextualBiasApplied = true;
      } catch {
        // Contextual biasing is optional and is not implemented by every browser yet.
      }
    }
    const restartWithoutContextualBias = () => {
      contextualBiasEnabledRef.current = false;
      attemptResolvedRef.current = true;
      clearNoResultTimer();
      listeningRef.current = false;
      setListening(false);
      setRecognitionReady(false);
      setNeedsRetry(false);
      partialCandidatesRef.current = [];
      detectedSpeechRef.current = false;
      setMessage("このブラウザに合わせて音声認識を再準備しています。");
      setAttemptVersion((value) => value + 1);
    };
    const announceReady = () => {
      if (attemptResolvedRef.current) return;
      setRecognitionReady(true);
      setMessage("準備ができました。表示された音を発音してください。");
    };
    recognition.onstart = announceReady;
    recognition.onaudiostart = announceReady;
    recognition.onsoundstart = beginNoResultTimer;
    recognition.onspeechstart = beginNoResultTimer;
    recognition.onspeechend = () => { if (!attemptResolvedRef.current) setMessage("判定中です。"); };
    recognition.onresult = (event) => {
      if (attemptResolvedRef.current) return;
      const candidates: string[] = [];
      let hasFinalResult = false;
      for (let resultIndex = 0; resultIndex < event.results.length; resultIndex += 1) {
        const alternatives = event.results[resultIndex];
        if (alternatives.isFinal) hasFinalResult = true;
        for (let alternativeIndex = 0; alternativeIndex < alternatives.length; alternativeIndex += 1) {
          const transcript = alternatives[alternativeIndex].transcript.trim();
          if (transcript) candidates.push(transcript);
        }
      }
      if (candidates.length) {
        partialCandidatesRef.current = Array.from(new Set([...partialCandidatesRef.current, ...candidates]));
        setMessage(hasFinalResult ? "判定中です。" : "音声を認識中です。");
      }
      if (hasFinalResult) recordResult(partialCandidatesRef.current);
    };
    recognition.onerror = (event) => {
      if (attemptResolvedRef.current) return;
      if (event.error === "aborted") return;
      if (event.error === "phrases-not-supported" && contextualBiasApplied) {
        restartWithoutContextualBias();
        return;
      }
      if (event.error === "no-speech" || event.error === "no-match") {
        if (partialCandidatesRef.current.length) recordResult(partialCandidatesRef.current);
        else if (detectedSpeechRef.current) retryNoRecognition();
        else markRetry("音声を検出できませんでした。もう一度録音してください。");
        return;
      }
      const errorMessages: Record<string, string> = {
        "audio-capture": "録音エラーです。もう一度試してください。",
        "not-allowed": "マイクの使用が許可されていません。ブラウザの設定を確認してください。",
        "service-not-allowed": "音声認識の使用が許可されていません。ブラウザの設定を確認してください。",
        network: "通信エラーです。端末の音声認識設定を確認してください。",
        "language-not-supported": "日本語の音声認識を利用できません。",
      };
      markRetry(errorMessages[event.error] || "音声認識エラーです。もう一度試してください。");
    };
    recognition.onend = () => {
      if (attemptResolvedRef.current) return;
      if (partialCandidatesRef.current.length) recordResult(partialCandidatesRef.current);
      else if (detectedSpeechRef.current) retryNoRecognition();
      else markRetry("音声を検出できませんでした。もう一度録音してください。");
    };

    try {
      recognition.start();
    } catch {
      if (contextualBiasApplied) restartWithoutContextualBias();
      else markRetry("音声認識を開始できませんでした。もう一度試してください。");
    }
  }, [clearNoResultTimer, markRetry, recordResult, retryNoRecognition]);

  useEffect(() => {
    if (!sounds.length || finished || listening || needsRetry) return;
    const timer = window.setTimeout(() => listen(), 450);
    return () => window.clearTimeout(timer);
  }, [attemptVersion, finished, index, listen, listening, needsRetry, sounds.length]);

  const correctCount = results.filter((result) => result.correct).length;
  return (
    <section className="view assessment-view">
      <div className="page-header"><div><div className="eyebrow">VOICE CHECK</div><h1>発音の判定</h1><p>音声認識を使って、25音の聞こえ方を確認します。</p></div></div>
      {!sounds.length ? <div className="assessment-intro"><div className="assessment-mark">◎</div><h2>声の現在地を確認しましょう</h2><p>結果は医療上の診断ではなく、練習のための目安です。静かな場所で、マイクの使用を許可してください。</p>{!supported && <div className="notice">このブラウザは音声判定に対応していません。ChromeまたはEdgeでお試しください。</div>}<button className="button primary" disabled={!supported} onClick={startAssessment}>判定をはじめる</button></div> : finished ? <div className="result-card"><span>今回の結果</span><strong>{Math.round((correctCount / results.length) * 100)}<small>%</small></strong><p>{results.length}音中 {correctCount}音を認識できました</p><div className="result-sounds">{results.map((result) => <span className={result.correct ? "ok" : "retry"} key={result.target}>{result.target}<small>{result.correct ? "○" : "△"}</small></span>)}</div><button className="button primary" onClick={startAssessment}>もう一度判定する</button></div> : <div className="assessment-stage"><div className="assessment-topline"><span>{index + 1} / {sounds.length}</span><div><i style={{ width: `${((index + 1) / sounds.length) * 100}%` }} /></div></div><p className="assessment-prompt">この音を発音してください</p><div className="target-sound">{sounds[index]}</div><button className={`listen-button ${listening ? "listening" : ""}`} onClick={() => listen(true)} disabled={listening || !needsRetry}><span>{listening ? recognitionReady ? "•••" : "…" : needsRetry ? "●" : "…"}</span>{listening ? recognitionReady ? "聞いています" : "マイク準備中" : needsRetry ? "もう一度録音" : "自動録音を準備中"}</button><p className="assessment-message">{message}</p><button className="button ghost" onClick={startAssessment} disabled={listening}>最初からやり直す</button></div>}
    </section>
  );
}

// ---------------- F2・tVSA音響評価（FFTピークによる目安測定） ----------------

type FormantPoint = { vowel: string; f1: number; f2: number };

function estimateFormants(spectra: Float32Array[], sampleRate: number): { f1: number; f2: number } | null {
  if (!spectra.length) return null;
  const nBins = spectra[0].length;
  const avg = new Float32Array(nBins);
  for (const s of spectra) for (let i = 0; i < nBins; i += 1) avg[i] += s[i];
  for (let i = 0; i < nBins; i += 1) avg[i] /= spectra.length;
  const binHz = sampleRate / 2 / nBins;
  const peakIn = (loHz: number, hiHz: number, exclude?: number) => {
    const lo = Math.max(1, Math.floor(loHz / binHz));
    const hi = Math.min(nBins - 1, Math.ceil(hiHz / binHz));
    let best = -1, bestVal = -1;
    for (let i = lo; i <= hi; i += 1) {
      if (exclude !== undefined && Math.abs(i * binHz - exclude) < 160) continue;
      if (avg[i] > bestVal) { bestVal = avg[i]; best = i; }
    }
    return best > 0 ? Math.round(best * binHz) : null;
  };
  const f1 = peakIn(220, 1000);
  if (!f1) return null;
  const f2 = peakIn(Math.max(900, f1 + 200), 3000, f1) ?? peakIn(900, 3000);
  return f2 ? { f1, f2 } : null;
}

function AcousticView({ onFinished }: { onFinished: () => void }) {
  const vowels = ["あ", "い", "う"];
  const [current, setCurrent] = useState(0);
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState("「あ」の発音を3秒間続けてから、録音ボタンを押してください。");
  const [points, setPoints] = useState<FormantPoint[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => window.clearInterval(timer);
  }, [recording]);

  async function recordVowel() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);
      const spectra: Float32Array[] = [];
      const buffer = new Float32Array(analyser.frequencyBinCount);
      setRecording(true);
      setElapsed(0);
      setMessage(`「${vowels[current]}」を声に出し続けてください…`);
      await new Promise<void>((resolve) => {
        const startedAt = Date.now();
        const collect = () => {
          analyser.getFloatFrequencyData(buffer);
          const linear = Float32Array.from(buffer, (db) => Math.pow(10, db / 10));
          spectra.push(linear.slice());
          if (Date.now() - startedAt < 3000) requestAnimationFrame(collect);
          else resolve();
        };
        requestAnimationFrame(collect);
      });
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
      const point = estimateFormants(spectra, ctx.sampleRate);
      setRecording(false);
      if (point) {
        setPoints((old) => [...old.filter((p) => p.vowel !== vowels[current]), { vowel: vowels[current], ...point }]);
        setMessage(`F1=${point.f1}Hz / F2=${point.f2}Hz を測定しました。`);
        if (current < vowels.length - 1) setMessage(`F1=${point.f1}Hz / F2=${point.f2}Hz を測定しました。次は「${vowels[current + 1]}」をお願いします。`);
        else onFinished();
      } else {
        setMessage("音声を検出できませんでした。もう一度お試しください。");
      }
      setCurrent((c) => (point ? Math.min(c + 1, vowels.length - 1) : c));
    } catch {
      setRecording(false);
      setMessage("マイクの使用が許可されていません。");
    }
  }

  const complete = points.length >= 3;
  const a = points.find((p) => p.vowel === "あ");
  const i = points.find((p) => p.vowel === "い");
  const u = points.find((p) => p.vowel === "う");
  const tvsa = a && i && u
    ? Math.round(Math.abs(a.f2 * (i.f1 - u.f1) + i.f2 * (u.f1 - a.f1) + u.f2 * (a.f1 - i.f1)) / 2)
    : null;
  return (
    <section className="view">
      <div className="page-header"><div><div className="eyebrow">ACOUSTIC</div><h1>F2・tVSA音響評価</h1><p>母音を3秒ずつ発声して、フォルマントの目安を測ります。</p></div></div>
      <div className="notice">測定値は簡易なスペクトム解析による<b>推定値</b>です。誤差があります。精密な測定には専用機器による分析が必要です。</div>
      <div className="acoustic-grid">
        <div className="acoustic-card">
          <div className="acoustic-vowel">{vowels[current]}</div>
          <p>{message}</p>
          {recording && <div className="recording-timer">{elapsed.toFixed(1)}秒</div>}
          <button className="button primary" disabled={recording} onClick={recordVowel}>{recording ? "測定中…" : `「${vowels[current]}」を測定する`}</button>
          <div className="acoustic-points">
            {points.map((p) => <span key={p.vowel}><b>{p.vowel}</b>F1 {p.f1}Hz／F2 {p.f2}Hz</span>)}
            {points.length === 0 && <small>まだ測定はありません</small>}
          </div>
        </div>
        {complete && a && i && u && (
          <div className="acoustic-result">
            <span>推定結果（目安）</span>
            <strong>F2(i) {i.f2}<small>Hz</small></strong>
            <strong>tVSA {tvsa}<small>Hz²</small></strong>
            <p>3母音（あ・い・う）のF1・F2から計算した三角形の面積です。数値は機器や環境により変動します。</p>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------- 課題提出 ----------------

function TaskCard({ task, onChange }: { task: Task; onChange: (id: string, saved: boolean) => void }) {
  const assetText = useAssetText(task.textAsset);
  const handleChange = useCallback((saved: boolean) => onChange(task.id, saved), [onChange, task.id]);
  return <article className="task-card"><div className="task-head"><span>{task.title}</span><small>目安 {task.minDurationSec || 3}秒以上</small></div><h3>{task.prompt}</h3>{assetText && <div className="task-reading">{assetText}</div>}<AudioRecorder compact storageKey={`submit:${task.id}`} onChange={handleChange} /></article>;
}

function SubmitView({ userName, onFinished }: { userName: string; onFinished: () => void }) {
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
      onFinished();
    } finally { setSharing(false); }
  }
  return <section className="view"><div className="page-header"><div><div className="eyebrow">ASSIGNMENT</div><h1>課題提出</h1><p>5つの課題を録音し、まとめて共有します。</p></div><div className="count-badge"><strong>{Object.values(saved).filter(Boolean).length}</strong><span>/ {tasks.length} 録音済み</span></div></div><div className="notice">録音はこの端末内に保存されます。共有ボタンを押すまで外部には送信されません。</div><div className="tasks-grid">{tasks.map((task) => <TaskCard task={task} onChange={update} key={task.id} />)}</div><div className="submit-bar"><div><b>{complete ? "すべての録音が揃いました" : "すべて録音すると共有できます"}</b><span>対応端末では共有メニューが開きます。</span></div><button className="button primary" disabled={!complete || sharing} onClick={share}>{sharing ? "準備中…" : "5件をまとめて共有"}</button></div></section>;
}

// ---------------- 食事：ガイダンス／レシピ／記録 ----------------

function MealGuidanceView() {
  return (
    <section className="view">
      <div className="page-header"><div><div className="eyebrow">GUIDANCE</div><h1>嚥下調整食のガイダンス</h1><p>「日本摂食嚥下リハビリテーション学会 嚥下調整食分類2021」に沿った説明です。</p></div></div>
      <div className="notice">実際の食形態は、担当の言語聴覚士・管理栄養士等の指示に従ってください。</div>
      <div className="guide-list">
        {dietGuides.map((g) => (
          <article className="guide-card" key={g.code}>
            <div className="guide-head"><span className="guide-code">{g.code}</span><h2>{g.name}</h2></div>
            <p><b>形態：</b>{g.form}</p>
            <p><b>例：</b>{g.example}</p>
            <p><b>ポイント：</b>{g.tips}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MealRecipeView() {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <section className="view">
      <div className="page-header"><div><div className="eyebrow">RECIPES</div><h1>嚥下調整食レシピ</h1><p>嚥下調整食の参考レシピ集です。</p></div></div>
      <div className="notice">
        レシピは <a href="https://shokushien.net/recipe/" target="_blank" rel="noreferrer">食支援ネットワーク</a> および
        <a href="https://www.jsdr.or.jp/doc/food_movie/" target="_blank" rel="noreferrer">日本摂食嚥下リハビリテーション学会の調理動画</a> をもとに要点をまとめたものです。栄養・嚥下状態に合わせて調整してください。
      </div>
      {Object.entries(recipes).map(([section, items]) => (
        <div className="recipe-section" key={section}>
          <h2>{section}</h2>
          <div className="recipe-list">
            {items.map((r) => {
              const key = `${section}:${r.title}`;
              const open = expanded === key;
              return (
                <article className="recipe-card" key={key}>
                  <button className="recipe-toggle" onClick={() => setExpanded(open ? null : key)}>
                    <span className="guide-code">{r.code}</span>
                    <b>{r.title}</b>
                    <span>{open ? "閉じる" : "作り方を見る"}</span>
                  </button>
                  {open && (
                    <div className="recipe-body">
                      <p><b>材料：</b>{r.ingredients}</p>
                      <p className="recipe-steps"><b>作り方：</b><br />{r.steps}</p>
                      <small>{r.note}</small>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

const mealTypes = ["朝食", "昼食", "夕食", "間食", "水分"];
const dietCodes = ["指定なし", "0j", "0t", "とろみ1", "とろみ2", "とろみ3", "1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4"];

function MealRecordView({ onSaved, userName }: { onSaved: () => void; userName: string }) {
  const [records, setRecords] = useState<MealRecord[]>([]);
  const [mealType, setMealType] = useState("朝食");
  const [dietCode, setDietCode] = useState("指定なし");
  const [description, setDescription] = useState("");
  const [intake, setIntake] = useState(100);
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => { setRecords(readJson<MealRecord[]>("articulation:meals", [])); setReady(true); }, []);

  function save() {
    const record: MealRecord = {
      id: String(Date.now()),
      date: new Date().toISOString(),
      mealType, dietCode,
      description: description.trim(),
      intakePercent: intake,
      kcal: Number(kcal) || 0,
      protein: Number(protein) || 0,
      notes: notes.trim(),
    };
    const next = [record, ...records].slice(0, 500);
    localStorage.setItem("articulation:meals", JSON.stringify(next));
    setRecords(next);
    setDescription(""); setKcal(""); setProtein(""); setNotes(""); setIntake(100);
    setStatus("記録を保存しました。");
    onSaved();
  }

  function downloadCsv() {
    const header = "記録日時,食事種別,嚥下調整食コード,品目・メニュー,摂取率(%),カロリー概算(kcal),タンパク質概算(g),メモ";
    const rows = records.slice().reverse().map((r) =>
      [new Date(r.date).toLocaleString("ja-JP"), r.mealType, r.dietCode, r.description, r.intakePercent, r.kcal, r.protein, r.notes]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","));
    const csv = "\uFEFF" + [header, ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `meal_records_${todayKey()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setStatus("CSVをダウンロードしました。");
  }

  function remove(id: string) {
    const next = records.filter((r) => r.id !== id);
    localStorage.setItem("articulation:meals", JSON.stringify(next));
    setRecords(next);
  }

  return (
    <section className="view">
      <div className="page-header"><div><div className="eyebrow">MEAL LOG</div><h1>食事記録</h1><p>食事の内容と摂取率を記録します（写真なし）。</p></div></div>
      <div className="meal-form">
        <div className="meal-field"><label>食事種別</label><div className="chip-row">{mealTypes.map((t) => <button key={t} className={mealType === t ? "chip active" : "chip"} onClick={() => setMealType(t)}>{t}</button>)}</div></div>
        <div className="meal-field"><label>嚥下調整食コード</label><div className="chip-row">{dietCodes.map((c) => <button key={c} className={dietCode === c ? "chip active" : "chip"} onClick={() => setDietCode(c)}>{c}</button>)}</div></div>
        <div className="meal-field"><label>品目・メニュー（例：全粥、煮魚、味噌汁）</label><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例：全粥、煮魚、味噌汁" /></div>
        <div className="meal-field"><label>摂取率：{intake}%</label><input type="range" min={0} max={100} step={25} value={intake} onChange={(e) => setIntake(Number(e.target.value))} /></div>
        <div className="meal-row2">
          <div className="meal-field"><label>カロリー概算 (kcal)</label><input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="例：500" /></div>
          <div className="meal-field"><label>タンパク質概算 (g)</label><input inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="例：25" /></div>
        </div>
        <div className="meal-field"><label>メモ（むせ込み・咳・所要時間など）</label><input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <div className="meal-actions">
          <button className="button primary" onClick={save}>記録を保存</button>
          <button className="button ghost" onClick={downloadCsv} disabled={!records.length}>CSVダウンロード</button>
          <a className="button ghost meal-mail" href={`mailto:articul811@gmail.com?subject=${encodeURIComponent(`食事記録 ${userName || "利用者"}`)}&body=${encodeURIComponent("ダウンロードしたCSVをこのメールに添付してお送りください。")}`} onClick={() => setStatus("メール作成画面を開きました。ダウンロードしたCSVを添付してください。")}>メールで共有</a>
        </div>
        {status && <p className="meal-status">{status}</p>}
      </div>
      <div className="card-title meal-list-title"><h2>記録一覧（新しい順・最大10件）</h2><b>{records.length}件</b></div>
      {ready && (records.length ? <div className="meal-records">{records.slice(0, 10).map((r) => (
        <div className="meal-record" key={r.id}>
          <div><b>{new Date(r.date).toLocaleString("ja-JP")}</b>　{r.mealType}　<span className="guide-code">{r.dietCode}</span></div>
          <p>{r.description || "（品目の記載なし）"}　摂取率 {r.intakePercent}%{r.kcal ? `　約${r.kcal}kcal` : ""}{r.protein ? `　タンパク質約${r.protein}g` : ""}</p>
          {r.notes && <small>{r.notes}</small>}
          <button className="text-button" onClick={() => remove(r.id)}>削除</button>
        </div>
      ))}</div> : <p className="meal-empty">まだ記録はありません。</p>)}
    </section>
  );
}

// ---------------- ログ ----------------

function calculateStreak(dates: string[]) {
  const dateSet = new Set(dates); let count = 0; const current = new Date();
  while (dateSet.has(current.toLocaleDateString("sv-SE"))) { count += 1; current.setDate(current.getDate() - 1); }
  return count;
}

function LogView({ log, sessions, meals }: { log: PracticeLog; sessions: AssessmentSession[]; meals: MealRecord[] }) {
  const streak = calculateStreak(log.doneDates);
  const clarityEntries: ClarityHistoryEntry[] = useMemo(() => {
    const entries: ClarityHistoryEntry[] = [];
    for (const set of Object.values(claritySets)) {
      const sessionsForSet = readJson<ClaritySession[]>("articulation:clarity:" + set.id, []);
      for (const s of sessionsForSet) {
        entries.push({
          setId: set.id, title: set.title, date: s.date,
          correctCount: s.results.filter((r) => r.judge !== "incorrect").length,
          totalCount: s.results.length,
        });
      }
    }
    return entries.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  }, []);
  const dailyMeals = useMemo(() => {
    const byDay = new Map<string, { kcal: number; protein: number; intake: number[] }>();
    for (const r of meals) {
      const day = new Date(r.date).toLocaleDateString("sv-SE");
      const entry = byDay.get(day) || { kcal: 0, protein: 0, intake: [] };
      entry.kcal += Math.round(r.kcal * r.intakePercent / 100);
      entry.protein += Math.round(r.protein * r.intakePercent / 100);
      entry.intake.push(r.intakePercent);
      byDay.set(day, entry);
    }
    return Array.from(byDay.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  }, [meals]);
  const badges = [
    { label: "はじめの一歩", unlocked: log.doneDates.length >= 1 }, { label: "3日連続", unlocked: streak >= 3 },
    { label: "7日連続", unlocked: streak >= 7 }, { label: "合計10日", unlocked: log.doneDates.length >= 10 },
  ];
  return <section className="view"><div className="page-header"><div><div className="eyebrow">YOUR PROGRESS</div><h1>カレンダー／ログ</h1><p>練習と食事の記録を確認します。</p></div></div><div className="log-grid"><article className="streak-card"><span>現在の連続記録</span><strong>{streak}<small>日</small></strong><p>今日の練習も記録されます</p></article><article className="calendar-card"><div className="card-title"><h2>練習した日</h2><b>{log.doneDates.length}日</b></div><div className="date-cloud">{log.doneDates.length ? log.doneDates.slice().reverse().slice(0, 14).map((date) => <span key={date}>{date.replaceAll("-", "/")}</span>) : <p>練習を終えると、ここに日付が記録されます。</p>}</div></article><article className="time-card"><div className="card-title"><h2>項目別の学習時間</h2><b>合計 {formatMinutes(log.totalMs)}</b></div><div className="time-list">{Object.entries(log.items).sort((a, b) => b[1].totalMs - a[1].totalMs).slice(0, 8).map(([id, item]) => <div key={id}><span>{item.title}</span><i><em style={{ width: `${Math.min(100, (item.totalMs / Math.max(log.totalMs, 1)) * 100 * 2.5)}%` }} /></i><b>{formatMinutes(item.totalMs)}</b></div>)}{!Object.keys(log.items).length && <p>項目を開いて練習すると時間が記録されます。</p>}</div></article><article className="history-card"><div className="card-title"><h2>発音判定の履歴</h2><b>{sessions.length}回</b></div>{sessions.length ? sessions.slice(0, 5).map((session) => <div className="history-row" key={session.date}><span>{new Date(session.date).toLocaleDateString("ja-JP")}</span><b>{session.correct} / {session.total}</b><em>{Math.round((session.correct / session.total) * 100)}%</em></div>) : <p>判定を行うと結果が記録されます。</p>}</article><article className="history-card clarity-card"><div className="card-title"><h2>単語明瞭度テストの結果</h2><b>{clarityEntries.length}件</b></div>{clarityEntries.length ? clarityEntries.map((e, i) => <div className="history-row" key={i}><span>{new Date(e.date).toLocaleDateString("ja-JP")}</span><b>{e.correctCount}/{e.totalCount} 正答</b><em>{e.title}</em></div>) : <p>テストを受けると結果が記録されます。</p>}<p className="tiny-note">※正答には許容範囲の回答を含みます。</p></article><article className="history-card meal-summary-card"><div className="card-title"><h2>食事の日別まとめ（最近14日）</h2><b>{dailyMeals.length}日</b></div>{dailyMeals.length ? dailyMeals.map(([day, v]) => <div className="history-row" key={day}><span>{day.replaceAll("-", "/")}</span><b>約{v.kcal}kcal</b><em>P {v.protein}g</em></div>) : <p>食事記録をつけると集計されます。</p>}<p className="tiny-note">摂取率をかけた概算値です。</p></article></div><div className="badges"><div className="section-heading"><div><span>MILESTONES</span><h2>バッジ</h2></div></div><div>{badges.map((badge) => <span className={badge.unlocked ? "unlocked" : "locked"} key={badge.label}><i>{badge.unlocked ? "★" : "·"}</i>{badge.label}</span>)}</div></div></section>;
}

// ---------------- 設定・ご案内 ----------------

function SettingsView({ userName, onRename }: { userName: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(userName);
  const [status, setStatus] = useState("");
  return (
    <section className="view">
      <div className="page-header"><div><div className="eyebrow">SETTINGS</div><h1>設定</h1><p>お名前とデータの管理を行います。</p></div></div>
      <div className="settings-list">
        <article className="settings-card">
          <h2>お名前</h2>
          <p>記録の表示に使われます。この端末の中にだけ保存されます。</p>
          <div className="settings-row">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="例：はしだ" />
            <button className="button primary" disabled={!draft.trim()} onClick={() => { onRename(draft.trim()); setStatus("お名前を保存しました。"); }}>保存</button>
          </div>
        </article>
        <article className="settings-card">
          <h2>データの削除</h2>
          <p>練習記録・判定履歴・食事記録・録音をすべて消去します。元に戻せません。</p>
          <button className="button danger" onClick={() => {
            if (!window.confirm("本当にすべての記録を消去しますか？")) return;
            localStorage.clear();
            indexedDB.deleteDatabase("articulation-training");
            window.location.reload();
          }}>すべてのデータを削除</button>
        </article>
        <article className="settings-card">
          <h2>通知について</h2>
          <p>練習のリマインダー通知はAndroidアプリ版の機能です。Web版では通知は行いません。</p>
        </article>
      </div>
      {status && <p className="meal-status">{status}</p>}
    </section>
  );
}

function PrivacyView() {
  return <section className="view policy-view"><div className="eyebrow">INFORMATION</div><h1>ご利用案内と<br />プライバシー</h1><div className="policy-lead">本アプリは、成人の発音学習・食事の自己管理を支援する教育用Webアプリです。</div><AndroidDownloadLink compact /><div className="policy-grid"><article><span>01</span><h2>マイクの使用</h2><p>録音・発音判定・音響評価を開始したときだけマイクを使用します。ブラウザから許可を求められた場合に、ご自身で選択できます。</p></article><article><span>02</span><h2>データの保存</h2><p>ユーザー名、練習履歴、判定履歴、食事記録、録音音声は、このブラウザの端末内に保存されます。サーバーへ自動送信しません。</p></article><article><span>03</span><h2>課題の共有</h2><p>課題提出や食事記録の共有操作を選んだ場合に限り、端末の共有機能・ダウンロード・メールを使ってデータを送信できます。送信前に内容を確認できます。</p></article><article><span>04</span><h2>大切なお知らせ</h2><p>表示される判定・測定値（発音判定・単語テスト・F2/tVSA・カロリー等）は目安であり、医療上の診断や治療を目的とするものではありません。</p></article></div><div className="contact-card"><div><span>CONTACT</span><h2>お問い合わせ</h2></div><a href="mailto:hashida1223@gmail.com">hashida1223@gmail.com →</a></div></section>;
}

// ---------------- アプリ本体 ----------------

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [userName, setUserName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [ready, setReady] = useState(false);
  const [log, setLog] = useState<PracticeLog>(defaultLog);
  const [sessions, setSessions] = useState<AssessmentSession[]>([]);
  const [meals, setMeals] = useState<MealRecord[]>([]);
  const [praise, setPraise] = useState(false);
  const clarityLog = useMemo(() => {
    const entries: ClarityHistoryEntry[] = [];
    for (const set of Object.values(claritySets)) {
      const sessionsForSet = readJson<ClaritySession[]>("articulation:clarity:" + set.id, []);
      for (const s of sessionsForSet) {
        entries.push({ setId: set.id, title: set.title, date: s.date, correctCount: s.results.filter((r) => r.judge !== "incorrect").length, totalCount: s.results.length });
      }
    }
    return entries.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  }, [praise]);
  const praiseTimer = useRef<number | null>(null);
  const showPraise = useCallback(() => {
    setPraise(true);
    if (praiseTimer.current) window.clearTimeout(praiseTimer.current);
    praiseTimer.current = window.setTimeout(() => setPraise(false), 2600);
  }, []);
  useEffect(() => () => { if (praiseTimer.current) window.clearTimeout(praiseTimer.current); }, []);

  useEffect(() => {
    setUserName(localStorage.getItem("articulation:user") || "");
    const savedLog = readJson("articulation:practice-log", defaultLog);
    if (savedLog.todayKey !== todayKey()) { savedLog.todayKey = todayKey(); savedLog.todayMs = 0; }
    setLog(savedLog); setSessions(readJson("articulation:assessments", [])); setMeals(readJson("articulation:meals", [])); setReady(true);
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

  function saveMealList(next: MealRecord[]) {
    setMeals(next);
  }

  function confirmName() {
    const name = draftName.trim(); if (!name) return; localStorage.setItem("articulation:user", name); setUserName(name);
  }

  const title = useMemo(() => navItems.find((item) => item.id === view)?.label || "ホーム", [view]);
  if (!ready) return <main className="loading-screen">発音練習・食事の自己管理を準備しています…</main>;
  return (
    <div className="app-shell">
      <header className="mobile-header"><button onClick={() => setView("home")}><img src={assetUrl("app-icon.png")} alt="" /><span>発音練習・食事の自己管理</span></button><b>{title}</b></header>
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("home")}><img src={assetUrl("app-icon.png")} alt="" /><span><b>発音練習・食事の自己管理</b><small>Articulation &amp; Meal Self-Care</small></span></button>
        <nav>{navItems.map((item) => <button className={view === item.id || (item.id === "speech" && ["practice", "assessment", "acoustic", "submit"].includes(view)) || (item.id === "meal" && ["mealGuidance", "mealRecipe", "mealRecord"].includes(view)) ? "active" : ""} onClick={() => setView(item.id)} key={item.id}><NavIcon name={item.id} /><span>{item.label}</span></button>)}</nav>
        <div className="sidebar-foot"><img className="sidebar-frog" src={frogUrl("frog_mascot")} alt="" /><p>焦らず、少しずつ。<br />今日もがんばりましょう。</p></div>
      </aside>
      <main className="main-content">
        {view === "home" && <Dashboard userName={userName} log={log} sessions={sessions} clarityLog={clarityLog} onGo={setView} onPraise={showPraise} />}
        {view === "speech" && <SpeechSectionView onGo={setView} />}
        {view === "meal" && <MealSectionView onGo={setView} />}
        {view === "practice" && <PracticeView onPractice={recordPractice} onPraise={showPraise} />}
        {view === "assessment" && <AssessmentView onSaved={saveSession} onFinished={showPraise} />}
        {view === "acoustic" && <AcousticView onFinished={showPraise} />}
        {view === "submit" && <SubmitView userName={userName} onFinished={showPraise} />}
        {view === "log" && <LogView log={log} sessions={sessions} meals={meals} />}
        {view === "mealGuidance" && <MealGuidanceView />}
        {view === "mealRecipe" && <MealRecipeView />}
        {view === "mealRecord" && <MealRecordView onSaved={() => { saveMealList(readJson<MealRecord[]>("articulation:meals", [])); showPraise(); }} userName={userName} />}
        {view === "settings" && <SettingsView userName={userName} onRename={setUserName} />}
        {view === "privacy" && <PrivacyView />}
      </main>
      <nav className="bottom-nav">{navItems.slice(0, 5).map((item) => <button className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} key={item.id}><NavIcon name={item.id} /><small>{item.label}</small></button>)}</nav>
      <PraisePopup show={praise} onClose={() => setPraise(false)} />
      {!userName && <div className="onboarding-backdrop"><div className="onboarding"><img src={assetUrl("app-icon.png")} alt="発音練習・食事の自己管理" /><h1>発音練習・食事の自己管理</h1><p>記録をこの端末に保存するため、最初にお名前を設定してください。</p><label>お名前またはニックネーム<input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && confirmName()} placeholder="例：はしだ" /></label><button className="button primary" onClick={confirmName} disabled={!draftName.trim()}>はじめる</button><small>入力した名前はこの端末内だけに保存されます。</small></div></div>}
    </div>
  );
}
