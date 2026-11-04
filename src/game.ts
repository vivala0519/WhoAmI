import dataset from "./players.json";
import dailySchedule from "./daily-schedule.json";
export type Player = (typeof dataset.players)[number];
export type Mode = "daily" | "unlimited";
export type Status = "playing" | "rewardOffer" | "won" | "lost" | "revealed";
export type Match = "exact" | "near" | "miss";
export type Category =
  "country" | "league" | "club" | "position" | "birthYear" | "number" | "value";
export interface Clue {
  key: Category;
  label: string;
  value: string;
  display?: string;
  match: Match;
  direction?: "up" | "down";
}
export interface Round {
  maxAttempts?: number;
  rewardAdsWatched?: number;
  answer: string;
  guesses: string[];
  status: Status;
}
export interface Stats {
  totalAttempts: number;
  played: number;
  won: number;
  streak: number;
  best: number;
  distribution: number[];
}
export interface GameState {
  version: 6;
  date: string;
  mode: Mode;
  daily: Round[];
  active: number;
  unlimited: Round;
  collections: Record<Mode, string[]>;
  dailyCollectionDates: Record<string, string>;
  stats: Stats;
  legacyStats?: Omit<Stats, "totalAttempts">;
}
export const MAX_ATTEMPTS = 5;
export const MAX_REWARDED_ADS = 3;
export const MAX_TOTAL_ATTEMPTS = 8;
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
export function categoriesForMode(mode: Mode) {
  return mode === "unlimited"
    ? [categories[0], "리그", ...categories.slice(1)]
    : categories;
}
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
// Keep the published schedule stable across visits and player-data updates.
export const DAILY_SCHEDULE_START = dailySchedule.startDate;
const dailyScheduleStart = Date.parse(DAILY_SCHEDULE_START + "T00:00:00Z");
export function dailyAnswers(date: string) {
  const timestamp = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(timestamp))
    throw new Error("Invalid daily challenge date");
  const dayOffset = Math.floor((timestamp - dailyScheduleStart) / 86_400_000);
  const size = dailySchedule.players.length;
  const index = ((dayOffset % size) + size) % size;
  return [dailySchedule.players[index]];
}
export const makeRound = (answer: string): Round => ({
  answer,
  maxAttempts: MAX_ATTEMPTS,
  rewardAdsWatched: 0,
  guesses: [],
  status: "playing",
});
export function randomAnswer(exclude?: string) {
  const pool = pools.unlimited.filter((id) => id !== exclude);
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return pool[values[0] % pool.length];
}
function emptyStats(): Stats {
  return {
    totalAttempts: 0,
    played: 0,
    won: 0,
    streak: 0,
    best: 0,
    distribution: Array(MAX_TOTAL_ATTEMPTS).fill(0),
  };
}
function recordDailyResult(
  stats: Stats,
  round: Round,
  attempts = round.guesses.length,
): Stats {
  if (round.status === "playing" || round.status === "rewardOffer")
    return stats;
  const won = round.status === "won";
  const streak = won ? stats.streak + 1 : 0;
  const distribution = Array.from(
    {
      length: Math.max(
        stats.distribution.length,
        round.maxAttempts ?? MAX_ATTEMPTS,
      ),
    },
    (_, i) => stats.distribution[i] ?? 0,
  );
  if (won) distribution[round.guesses.length - 1]++;
  return {
    totalAttempts: stats.totalAttempts + attempts,
    played: stats.played + 1,
    won: stats.won + Number(won),
    streak,
    best: Math.max(streak, stats.best),
    distribution,
  };
}
export function initialState(date = dayKey()): GameState {
  return {
    version: 6,
    date,
    mode: "daily",
    daily: dailyAnswers(date).map(makeRound),
    active: 0,
    unlimited: makeRound(randomAnswer()),
    collections: { daily: [], unlimited: [] },
    dailyCollectionDates: {},
    stats: emptyStats(),
  };
}
export function activeRound(s: GameState) {
  return s.mode === "daily" ? s.daily[s.active] : s.unlimited;
}
export function averageWinningAttempts(stats: Stats): number | null {
  if (!stats.won) return null;
  return (
    stats.distribution.reduce(
      (sum, count, index) => sum + count * (index + 1),
      0,
    ) / stats.won
  );
}
export function money(value: number) {
  return `약 ${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format((value * 1492.35) / 100_000_000)}억 원`;
}
export function compare(
  guess: Player,
  answer: Player,
  mode: Mode = "daily",
): Clue[] {
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
    ...(mode === "unlimited"
      ? [
          text(
            "league",
            "리그",
            guess.league,
            guess.leagueId === answer.leagueId,
          ),
        ]
      : []),
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
  | {
      type: "grantReward" | "finish";
      answer: string;
      mode: Mode;
      date: string;
      offerAtGuess: number;
    }
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
    if (current.status === "playing" || current.status === "rewardOffer")
      return state;
    if (state.mode === "daily")
      return state.active < state.daily.length - 1
        ? { ...state, active: state.active + 1 }
        : state;
    const answer = action.answer ?? randomAnswer(current.answer);
    return pools.unlimited.includes(answer)
      ? { ...state, unlimited: makeRound(answer) }
      : state;
  }
  if (action.type === "grantReward" || action.type === "finish") {
    if (
      current.status !== "rewardOffer" ||
      current.rewardAdsWatched === undefined ||
      current.rewardAdsWatched >= MAX_REWARDED_ADS ||
      current.maxAttempts !== MAX_ATTEMPTS + current.rewardAdsWatched ||
      current.guesses.length !== current.maxAttempts ||
      action.offerAtGuess !== current.guesses.length ||
      action.answer !== current.answer ||
      action.mode !== state.mode ||
      action.date !== state.date
    )
      return state;
    const round: Round =
      action.type === "grantReward"
        ? {
            ...current,
            rewardAdsWatched: current.rewardAdsWatched + 1,
            maxAttempts: current.maxAttempts + 1,
            status: "playing",
          }
        : { ...current, status: "lost" };
    return state.mode === "daily"
      ? {
          ...state,
          stats: recordDailyResult(state.stats, round),
          daily: state.daily.map((r, i) => (i === state.active ? round : r)),
        }
      : { ...state, unlimited: round };
  }
  if (current.status !== "playing") return state;
  let round: Round;
  if (action.type === "reveal") round = { ...current, status: "revealed" };
  else if (action.type === "guess") {
    const limit = current.maxAttempts ?? MAX_ATTEMPTS;
    if (
      !pools[state.mode].includes(action.id) ||
      current.guesses.includes(action.id) ||
      current.guesses.length >= limit
    )
      return state;
    const guesses = [...current.guesses, action.id];
    round = {
      ...current,
      guesses,
      status:
        action.id === current.answer
          ? "won"
          : guesses.length >= limit
            ? current.rewardAdsWatched !== undefined &&
              current.rewardAdsWatched < MAX_REWARDED_ADS
              ? "rewardOffer"
              : "lost"
            : "playing",
    };
  } else return state;
  const stats =
    state.mode === "daily"
      ? recordDailyResult(state.stats, round)
      : state.stats;
  const collections =
    round.status === "won" &&
    !state.collections[state.mode].includes(round.answer)
      ? {
          ...state.collections,
          [state.mode]: [...state.collections[state.mode], round.answer],
        }
      : state.collections;
  const dailyCollectionDates =
    state.mode === "daily" &&
    round.status === "won" &&
    !state.dailyCollectionDates[round.answer]
      ? { ...state.dailyCollectionDates, [round.answer]: state.date }
      : state.dailyCollectionDates;
  return state.mode === "daily"
    ? {
        ...state,
        stats,
        collections,
        dailyCollectionDates,
        daily: state.daily.map((r, i) => (i === state.active ? round : r)),
      }
    : { ...state, stats, collections, unlimited: round };
}
export function restore(raw: string | null, date = dayKey()): GameState {
  const fresh = () => initialState(date);
  try {
    if (!raw) return fresh();
    const s = JSON.parse(raw) as Omit<
      GameState,
      "version" | "collections" | "dailyCollectionDates"
    > & {
      version: number;
      collections?: unknown;
      dailyCollectionDates?: unknown;
    };
    const legacyRules = s.version === 1;
    const mixedStats = s.version < 3;
    const validRound = (r: Round, mode: Mode) => {
      const limit = legacyRules ? 8 : (r?.maxAttempts ?? MAX_ATTEMPTS);
      const watched = r?.rewardAdsWatched;
      return (
        r &&
        [5, 6, 7, MAX_TOTAL_ATTEMPTS].includes(limit) &&
        (watched === undefined
          ? [5, 7, MAX_TOTAL_ATTEMPTS].includes(limit)
          : Number.isInteger(watched) &&
            watched >= 0 &&
            watched <= MAX_REWARDED_ADS &&
            limit === MAX_ATTEMPTS + watched) &&
        pools[mode].includes(r.answer) &&
        Array.isArray(r.guesses) &&
        r.guesses.length <= limit &&
        new Set(r.guesses).size === r.guesses.length &&
        r.guesses.every((id) => pools[mode].includes(id)) &&
        ["playing", "rewardOffer", "won", "lost", "revealed"].includes(
          r.status,
        ) &&
        (r.status !== "won" || r.guesses.at(-1) === r.answer) &&
        (r.status !== "rewardOffer" ||
          (limit < MAX_TOTAL_ATTEMPTS &&
            (watched !== undefined ||
              (s.version === 3 && limit === MAX_ATTEMPTS)) &&
            r.guesses.length === limit &&
            !r.guesses.includes(r.answer))) &&
        (r.status !== "playing" ||
          (r.guesses.length < limit && !r.guesses.includes(r.answer)))
      );
    };
    const validStats = (stats: Omit<Stats, "totalAttempts">) =>
      stats &&
      Array.isArray(stats.distribution) &&
      [5, 7, MAX_TOTAL_ATTEMPTS].includes(stats.distribution.length) &&
      [
        stats.played,
        stats.won,
        stats.streak,
        stats.best,
        ...stats.distribution,
      ].every((n) => Number.isInteger(n) && n >= 0) &&
      stats.won <= stats.played;
    if (
      ![1, 2, 3, 4, 5, 6].includes(s.version) ||
      !["daily", "unlimited"].includes(s.mode) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
      !Array.isArray(s.daily) ||
      !(mixedStats ? [DAILY_COUNT, 3] : [DAILY_COUNT]).includes(
        s.daily.length,
      ) ||
      !s.daily.every((r) => validRound(r, "daily")) ||
      !validRound(s.unlimited, "unlimited") ||
      !Number.isInteger(s.active) ||
      s.active < 0 ||
      s.active >= s.daily.length ||
      !validStats(s.stats) ||
      (!mixedStats &&
        (!Number.isInteger(s.stats.totalAttempts) ||
          s.stats.totalAttempts < 0)) ||
      (s.legacyStats !== undefined && !validStats(s.legacyStats))
    )
      return fresh();
    const normalizeRound = (round: Round): Round => {
      const oldLimit = legacyRules
        ? MAX_TOTAL_ATTEMPTS
        : (round.maxAttempts ?? MAX_ATTEMPTS);
      if (round.rewardAdsWatched !== undefined)
        return { ...round, maxAttempts: oldLimit };
      if (round.status === "rewardOffer")
        return { ...round, maxAttempts: MAX_ATTEMPTS, rewardAdsWatched: 0 };
      if (round.status !== "playing")
        return { ...round, maxAttempts: oldLimit };
      // A save from the interim +3-per-ad rule may have one rewarded ad and
      // five to seven guesses. Keep its progress under the corrected rule.
      if (
        !legacyRules &&
        oldLimit === MAX_TOTAL_ATTEMPTS &&
        round.guesses.length >= MAX_ATTEMPTS
      ) {
        const watched = Math.max(1, round.guesses.length - MAX_ATTEMPTS);
        const limit = MAX_ATTEMPTS + watched;
        return {
          ...round,
          maxAttempts: limit,
          rewardAdsWatched: watched,
          status: round.guesses.length === limit ? "rewardOffer" : "playing",
        };
      }
      // Preserve progress in older rounds already past the new base limit.
      if (round.guesses.length >= MAX_ATTEMPTS)
        return { ...round, maxAttempts: oldLimit };
      return { ...round, maxAttempts: MAX_ATTEMPTS, rewardAdsWatched: 0 };
    };
    const daily =
      s.date === date
        ? s.daily.slice(0, DAILY_COUNT).map(normalizeRound)
        : dailyAnswers(date).map(makeRound);
    const unlimited = normalizeRound(s.unlimited);
    const savedCollections =
      s.version >= 5 &&
      s.collections &&
      typeof s.collections === "object" &&
      !Array.isArray(s.collections)
        ? (s.collections as Partial<Record<Mode, unknown>>)
        : {};
    const collectedIds = (mode: Mode, wonAnswers: string[]) => {
      const pool = new Set(pools[mode]);
      const saved = savedCollections[mode];
      return [
        ...new Set(
          [...(Array.isArray(saved) ? saved : []), ...wonAnswers].filter(
            (id): id is string => typeof id === "string" && pool.has(id),
          ),
        ),
      ];
    };
    const collections: Record<Mode, string[]> = {
      daily: collectedIds(
        "daily",
        s.daily
          .filter((round) => round.status === "won")
          .map((round) => round.answer),
      ),
      unlimited: collectedIds(
        "unlimited",
        s.unlimited.status === "won" ? [s.unlimited.answer] : [],
      ),
    };
    const savedDailyDates =
      s.version === 6 &&
      s.dailyCollectionDates &&
      typeof s.dailyCollectionDates === "object" &&
      !Array.isArray(s.dailyCollectionDates)
        ? (s.dailyCollectionDates as Record<string, unknown>)
        : {};
    const dailyCollectionDates: Record<string, string> = {};
    const collectedDailyIds = new Set(collections.daily);
    for (const [id, savedDate] of Object.entries(savedDailyDates)) {
      if (
        collectedDailyIds.has(id) &&
        typeof savedDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(savedDate)
      )
        dailyCollectionDates[id] = savedDate;
    }
    for (const round of s.daily) {
      if (round.status === "won" && !dailyCollectionDates[round.answer])
        dailyCollectionDates[round.answer] = s.date;
    }
    let stats = {
      ...s.stats,
      distribution: Array.from(
        { length: Math.max(s.stats.distribution.length, MAX_TOTAL_ATTEMPTS) },
        (_, i) => s.stats.distribution[i] ?? 0,
      ),
    };
    if (mixedStats) {
      // Mixed historical counters cannot be split by mode. Recover only the
      // saved first daily result, whose mode and actual guess count are known.
      const savedDaily = s.date === date ? daily[0] : s.daily[0];
      stats = emptyStats();
      if (
        savedDaily.status !== "playing" &&
        savedDaily.status !== "rewardOffer"
      )
        stats = recordDailyResult(
          stats,
          normalizeRound(savedDaily),
          s.daily[0].guesses.length,
        );
    }
    return {
      ...s,
      version: 6,
      date,
      active: 0,
      daily,
      unlimited,
      collections,
      dailyCollectionDates,
      stats,
      ...(mixedStats
        ? {
            legacyStats: {
              ...s.stats,
              distribution: [...s.stats.distribution],
            },
          }
        : {}),
    };
  } catch {
    return fresh();
  }
}
export function shareText(state: GameState) {
  const averageAttempts = averageWinningAttempts(state.stats);
  const [, month, day] = state.date.split("-");
  const r = activeRound(state),
    answer = playerMap.get(r.answer)!,
    marks = { exact: "🟪", near: "🟨", miss: "🟥" };
  const result =
    r.status === "won"
      ? "성공!"
      : r.status === "playing" || r.status === "rewardOffer"
        ? "진행 중"
        : "실패!";
  return [
    "Who am I?",
    `${state.mode === "daily" ? `${month}월 ${day}일 오늘의 챌린지 ${result}` : "무제한 모드"}`,
    "",
    ...r.guesses.map((id) =>
      compare(playerMap.get(id)!, answer, state.mode)
        .map((c) => marks[c.match])
        .join(""),
    ),
    `누적 플레이: ${state.stats.played}회`,
    `승률: ${state.stats.played ? `${Math.round((state.stats.won / state.stats.played) * 100)}%` : "—"}`,
    `평균 시도 횟수: ${averageAttempts === null ? "—" : `${averageAttempts.toFixed(1)}회`}`,
    `현재 연승: ${state.stats.streak}연승`,
    "",
    "나도 풀러 가기",
    "https://tossminiapp.com/s/p42d6aeg",
  ].join("\n");
}
