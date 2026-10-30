import dataset from "./players.json";
export type Player = (typeof dataset.players)[number];
export type Mode = "daily" | "unlimited";
export type Status = "playing" | "won" | "lost" | "revealed";
export type Match = "exact" | "near" | "miss";
export type Category =
  "country" | "club" | "position" | "birthYear" | "number" | "value";
export interface Clue {
  key: Category;
  label: string;
  value: string;
  display?: string;
  match: Match;
  direction?: "up" | "down";
}
export interface Round {
  answer: string;
  guesses: string[];
  status: Status;
}
export interface Stats {
  played: number;
  won: number;
  streak: number;
  best: number;
  distribution: number[];
}
export interface GameState {
  version: 1;
  date: string;
  mode: Mode;
  daily: Round[];
  active: number;
  unlimited: Round;
  stats: Stats;
}
export const MAX_ATTEMPTS = 8;
export const DAILY_COUNT = 1;
export const players = dataset.players;
export const playerMap = new Map(players.map((p) => [p.id, p]));
export const pools = { daily: dataset.daily, unlimited: dataset.world };
export const DATA_VERSION = dataset.version;
export const categories = [
  "국적",
  "구단",
  "포지션",
  "출생연도",
  "등번호",
  "시장가치",
];
export function dayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function hash(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function dailyAnswers(date: string) {
  const ids = [...pools.daily];
  let seed = hash(`who-am-i-ko:${DATA_VERSION}:${date}`);
  for (let i = ids.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, DAILY_COUNT);
}
export const makeRound = (answer: string): Round => ({
  answer,
  guesses: [],
  status: "playing",
});
export function randomAnswer(exclude?: string) {
  const pool = pools.unlimited.filter((id) => id !== exclude);
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return pool[values[0] % pool.length];
}
export function initialState(date = dayKey()): GameState {
  return {
    version: 1,
    date,
    mode: "daily",
    daily: dailyAnswers(date).map(makeRound),
    active: 0,
    unlimited: makeRound(randomAnswer()),
    stats: {
      played: 0,
      won: 0,
      streak: 0,
      best: 0,
      distribution: Array(8).fill(0),
    },
  };
}
export function activeRound(s: GameState) {
  return s.mode === "daily" ? s.daily[s.active] : s.unlimited;
}
export function money(value: number) {
  return `약 ${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format((value * 1492.35) / 100_000_000)}억 원`;
}
export function compare(guess: Player, answer: Player): Clue[] {
  const text = (
    key: Category,
    label: string,
    value: string,
    equal: boolean,
    near = false,
  ): Clue => ({
    key,
    label,
    value,
    match: equal ? "exact" : near ? "near" : "miss",
  });
  const number = (
    key: "birthYear" | "number" | "value",
    label: string,
    g: number | null,
    a: number | null,
    value: string,
  ): Clue => ({
    key,
    label,
    value,
    match: g === a ? "exact" : "miss",
    ...(g !== null && a !== null && g !== a
      ? { direction: g < a ? ("up" as const) : ("down" as const) }
      : {}),
  });
  return [
    text(
      "country",
      "국적",
      guess.country,
      guess.countryId === answer.countryId,
    ),
    text("club", "구단", guess.club, guess.clubId === answer.clubId),
    text(
      "position",
      "포지션",
      guess.positionCode,
      guess.positionId === answer.positionId,
      guess.positionGroup === answer.positionGroup,
    ),
    number(
      "birthYear",
      "출생연도",
      guess.birthYear,
      answer.birthYear,
      `${guess.birthYear}년`,
    ),
    number(
      "number",
      "등번호",
      guess.number,
      answer.number,
      guess.number === null ? "—" : String(guess.number),
    ),
    number("value", "시장가치", guess.value, answer.value, money(guess.value)),
  ];
}
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f\s.\-']/g, "")
    .toLowerCase();
const chosung = (s: string) =>
  [...s]
    .map((c) => {
      const code = c.charCodeAt(0) - 44032;
      return code >= 0 && code < 11172
        ? "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"[Math.floor(code / 588)]
        : c;
    })
    .join("");
export function searchPlayers(
  query: string,
  mode: Mode,
  guessed: string[] = [],
) {
  const q = normalize(query.trim());
  if (!q) return [];
  const ids = new Set(pools[mode]),
    used = new Set(guessed);
  return players
    .filter(
      (p) =>
        ids.has(p.id) &&
        !used.has(p.id) &&
        (normalize(p.name).includes(q) ||
          normalize(p.latin).includes(q) ||
          normalize(chosung(p.name)).includes(q)),
    )
    .sort(
      (a, b) =>
        Number(normalize(b.name).startsWith(q)) -
          Number(normalize(a.name).startsWith(q)) || b.value - a.value,
    )
    .slice(0, 10);
}
export type Action =
  | { type: "mode"; mode: Mode }
  | { type: "guess"; id: string }
  | { type: "reveal" }
  | { type: "next"; answer?: string }
  | { type: "daily"; index: number }
  | { type: "day"; date: string };
export function reducer(state: GameState, action: Action): GameState {
  if (action.type === "mode") return { ...state, mode: action.mode };
  if (action.type === "day")
    return action.date === state.date
      ? state
      : {
          ...state,
          date: action.date,
          daily: dailyAnswers(action.date).map(makeRound),
          active: 0,
        };
  if (action.type === "daily")
    return action.index >= 0 &&
      action.index < state.daily.length &&
      action.index <= state.active
      ? { ...state, mode: "daily", active: action.index }
      : state;
  const current = activeRound(state);
  if (action.type === "next") {
    if (current.status === "playing") return state;
    if (state.mode === "daily")
      return state.active < state.daily.length - 1
        ? { ...state, active: state.active + 1 }
        : state;
    const answer = action.answer ?? randomAnswer(current.answer);
    return pools.unlimited.includes(answer)
      ? { ...state, unlimited: makeRound(answer) }
      : state;
  }
  if (current.status !== "playing") return state;
  let round: Round;
  if (action.type === "reveal") round = { ...current, status: "revealed" };
  else if (action.type === "guess") {
    if (
      !pools[state.mode].includes(action.id) ||
      current.guesses.includes(action.id) ||
      current.guesses.length >= MAX_ATTEMPTS
    )
      return state;
    const guesses = [...current.guesses, action.id];
    round = {
      ...current,
      guesses,
      status:
        action.id === current.answer
          ? "won"
          : guesses.length >= MAX_ATTEMPTS
            ? "lost"
            : "playing",
    };
  } else return state;
  let stats = state.stats;
  if (round.status !== "playing") {
    const won = round.status === "won",
      streak = won ? stats.streak + 1 : 0,
      distribution = [...stats.distribution];
    if (won) distribution[round.guesses.length - 1]++;
    stats = {
      played: stats.played + 1,
      won: stats.won + Number(won),
      streak,
      best: Math.max(streak, stats.best),
      distribution,
    };
  }
  return state.mode === "daily"
    ? {
        ...state,
        stats,
        daily: state.daily.map((r, i) => (i === state.active ? round : r)),
      }
    : { ...state, stats, unlimited: round };
}
export function restore(raw: string | null, date = dayKey()): GameState {
  const fresh = () => initialState(date);
  try {
    if (!raw) return fresh();
    const s = JSON.parse(raw) as GameState;
    const validRound = (r: Round, mode: Mode) =>
      r &&
      pools[mode].includes(r.answer) &&
      Array.isArray(r.guesses) &&
      r.guesses.length <= 8 &&
      new Set(r.guesses).size === r.guesses.length &&
      r.guesses.every((id) => pools[mode].includes(id)) &&
      ["playing", "won", "lost", "revealed"].includes(r.status) &&
      (r.status !== "won" || r.guesses.at(-1) === r.answer) &&
      (r.status !== "playing" ||
        (r.guesses.length < 8 && !r.guesses.includes(r.answer)));
    if (
      s.version !== 1 ||
      !["daily", "unlimited"].includes(s.mode) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
      !Array.isArray(s.daily) ||
      ![DAILY_COUNT, 3].includes(s.daily.length) ||
      !s.daily.every((r) => validRound(r, "daily")) ||
      !validRound(s.unlimited, "unlimited") ||
      !Number.isInteger(s.active) ||
      s.active < 0 ||
      s.active >= s.daily.length ||
      !s.stats ||
      !Array.isArray(s.stats.distribution) ||
      s.stats.distribution.length !== 8 ||
      [
        s.stats.played,
        s.stats.won,
        s.stats.streak,
        s.stats.best,
        ...s.stats.distribution,
      ].some((n) => !Number.isInteger(n) || n < 0) ||
      s.stats.won > s.stats.played
    )
      return fresh();
    // Keep the original first daily puzzle when migrating three-puzzle saves.
    const migrated = { ...s, daily: s.daily.slice(0, DAILY_COUNT), active: 0 };
    return reducer(migrated, { type: "day", date });
  } catch {
    return fresh();
  }
}
export function shareText(state: GameState) {
  const r = activeRound(state),
    answer = playerMap.get(r.answer)!,
    marks = { exact: "🟩", near: "🟨", miss: "🟥" };
  return [
    `WHO AM I? · ${state.mode === "daily" ? `${state.date} 오늘의 챌린지` : "무제한 모드"}`,
    `${r.status === "won" ? r.guesses.length : "X"}/8`,
    ...r.guesses.map((id) =>
      compare(playerMap.get(id)!, answer)
        .map((c) => marks[c.match])
        .join(""),
    ),
  ].join("\n");
}
