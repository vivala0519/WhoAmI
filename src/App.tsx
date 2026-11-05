import { useEffect, useId, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Icon } from "./icons";
import playerPhotos from "./player-photos.json";
import { ParticleBall } from "./ParticleBall";
import { useInterstitialAd } from "./useInterstitialAd";
import { useRewardedAd } from "./useRewardedAd";
import {
  grantPromotionMilestone,
  PROMOTION_TEST_MODE,
} from "./promotion";
import {
  PROMOTION_END_DATE,
  PROMOTION_REWARD_POINTS,
  PROMOTION_START_DATE,
  PROMOTION_STREAK_DAYS,
} from "./promotionConfig";
import type { PromotionOutcome } from "./promotion";
import {
  activeRound,
  averageWinningAttempts,
  categoriesForMode,
  compare,
  DATA_VERSION,
  DAILY_COUNT,
  dayKey,
  MAX_ATTEMPTS,
  MAX_REWARDED_ADS,
  MAX_TOTAL_ATTEMPTS,
  money,
  playerMap,
  pools,
  reducer,
  restore,
  searchPlayers,
  shareText,
} from "./game";
import type { Clue, Mode, Player } from "./game";

const STORAGE_KEY = "who-am-i-ko:v1";
type ModalType = "help" | "stats" | "collection" | "reveal" | "share" | null;
type VisiblePromotionOutcome = PromotionOutcome | { status: "pending" } | null;
function promotionOutcomeText(outcome: VisiblePromotionOutcome) {
  switch (outcome?.status) {
    case "paid":
      return PROMOTION_TEST_MODE
        ? "테스트 포인트 지급을 완료했어요."
        : `${PROMOTION_REWARD_POINTS}포인트 지급을 완료했어요.`;
    case "unsupported":
      return "토스 앱을 업데이트한 뒤 포인트 지급을 확인해 주세요.";
    case "retryable":
      return "프로모션이 아직 시작되지 않았어요. 시작 후 다시 확인해 주세요.";
    case "unavailable":
      return outcome.code === "4112"
        ? "프로모션 예산이 소진되어 지급하지 못했어요."
        : "프로모션이 종료되었거나 지급할 수 없는 상태예요.";
    case "storageError":
      return "기록을 저장할 수 없어 포인트 지급을 진행하지 못했어요.";
    case "uncertain":
      return "지급 결과를 확인하지 못했어요. 포인트 내역을 확인해 주세요.";
    default:
      return "포인트 지급을 확인하고 있어요.";
  }
}
function Kit({
  number = "?",
  color = "var(--accent)",
  className = "",
}: {
  number?: string;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 240"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m77 46-46 26 20 44 25-12v91c34 13 54 13 88 0v-91l25 12 20-44-46-26c-9 14-18 21-43 21S85 60 77 46Z"
        fill={color}
        fillOpacity=".09"
        stroke={color}
        strokeWidth="2"
      />
      <path
        d="m77 46 16-7c3 22 51 22 54 0l16 7M76 104l2-33m86 33-2-33M81 182c27 10 51 10 78 0"
        stroke={color}
        strokeOpacity=".5"
        strokeWidth="2"
      />
      <text
        x="120"
        y="150"
        textAnchor="middle"
        fill={color}
        fontSize="76"
        fontWeight="700"
        fontFamily="system-ui,sans-serif"
      >
        {number}
      </text>
    </svg>
  );
}
function PlayerAvatar({ player }: { player: Player }) {
  const photo = (playerPhotos as Record<string, string>)[player.id];
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  return (
    <span
      className="avatar"
      style={{ "--kit-color": player.color } as React.CSSProperties}
    >
      {photo && failedPhoto !== photo ? (
        <img
          className="avatar-photo"
          src={photo}
          alt={player.name + " 선수 사진"}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedPhoto(photo)}
        />
      ) : (
        <Kit
          number={player.number === null ? "·" : String(player.number)}
          color="currentColor"
        />
      )}
    </span>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    return () => {
      if (d.open) d.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="닫기" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Tile({ clue, small = false }: { clue: Clue; small?: boolean }) {
  const state =
    clue.match === "exact"
      ? "일치"
      : clue.match === "near"
        ? "같은 포지션 계열"
        : "불일치";
  return (
    <div
      className={`clue ${clue.match} ${small ? "small" : ""}`}
      title={`${clue.label}: ${clue.value} · ${state}${clue.direction ? (clue.direction === "up" ? " · 정답이 더 높음" : " · 정답이 더 낮음") : ""}`}
      aria-label={`${clue.label} ${clue.value}, ${state}${clue.direction ? (clue.direction === "up" ? ", 정답이 더 높음" : ", 정답이 더 낮음") : ""}`}
    >
      <span className="clue-content">
        {clue.key === "country" && (
          <span className="country-mark" aria-hidden="true">
            {clue.value.slice(0, 1)}
          </span>
        )}
        <strong className={clue.display ? "entity-code" : ""}>
          {clue.display ?? clue.value}
        </strong>
        {clue.direction && (
          <Icon
            name="arrow"
            className={clue.direction === "down" ? "down" : ""}
          />
        )}{" "}
        {clue.match === "exact" && <Icon name="check" className="tile-check" />}
      </span>
      <span className="clue-label">{clue.label}</span>
    </div>
  );
}
function Search({
  mode,
  guesses,
  onGuess,
}: {
  mode: Mode;
  guesses: string[];
  onGuess: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [focused, setFocused] = useState(false),
    [highlight, setHighlight] = useState(0);
  const results = searchPlayers(query, mode, guesses),
    listId = useId(),
    input = useRef<HTMLInputElement>(null);
  const open = focused && query.trim().length > 0;
  const pick = (p: Player) => {
    onGuess(p.id);
    setQuery("");
    setHighlight(0);
    input.current?.focus();
  };
  return (
    <div className="search-wrap">
      <div className={`search-input ${focused ? "focused" : ""}`}>
        <Icon name="search" width="23" height="23" />
        <input
          ref={input}
          role="combobox"
          aria-label="선수 이름 검색"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-activedescendant={
            open && results[highlight] ? `${listId}-${highlight}` : undefined
          }
          autoComplete="off"
          placeholder={
            guesses.length
              ? "다음으로 떠오르는 선수는?"
              : "선수 이름을 입력하세요"
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            if (
              !e.currentTarget.parentElement?.parentElement?.contains(
                e.relatedTarget,
              )
            )
              setFocused(false);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setFocused(true);
              setHighlight((i) => Math.min(i + 1, results.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter" && open && results[highlight]) {
              e.preventDefault();
              pick(results[highlight]);
            }
            if (e.key === "Escape") setFocused(false);
          }}
        />
        {query ? (
          <button
            className="icon-button clear-search"
            aria-label="검색어 지우기"
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        ) : (
          <span className="search-key" aria-hidden="true">
            검색
          </span>
        )}
      </div>
      {open && (
        <div
          className="search-results"
          id={listId}
          role="listbox"
          aria-label="검색 결과"
        >
          {results.length ? (
            <>
              <div className="result-hint">선택하면 추측이 제출돼요</div>
              {results.map((p, i) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  id={`${listId}-${i}`}
                  key={p.id}
                  className={`search-result ${i === highlight ? "highlight" : ""}`}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                >
                  <PlayerAvatar player={p} />
                  <span className="result-name">
                    <strong>{p.name}</strong>
                    <span>{p.latin}</span>
                  </span>
                  <span className="result-club">{p.club}</span>
                  <Icon name="chevron" />
                </button>
              ))}
            </>
          ) : (
            <div className="empty-result">
              <strong>검색 결과가 없어요</strong>
              <p>
                한글·영문 이름이나 초성으로 다시 검색해 보세요.
                <br />
                이미 추측한 선수는 목록에 표시되지 않아요.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function HelpContent({ mode }: { mode: Mode }) {
  const clueCategories = categoriesForMode(mode);
  return (
    <>
      <p className="modal-intro">
        기본 5번 안에 축구 선수의 정체를 맞혀보세요. 기회를 모두 쓰면 광고를 볼
        때마다 1번 더 도전할 수 있어요. 광고는 한 문제에서 최대 3번 볼 수
        있어요.
      </p>
      <ol className="help-steps">
        <li>
          <span>01</span>
          <div>
            <strong>선수 이름을 검색하세요</strong>
            <p>
              한국어, 영문, 초성 검색을 지원해요. 목록에서 선수를 선택하면 한
              번의 기회를 사용해요.
            </p>
          </div>
        </li>
        <li>
          <span>02</span>
          <div>
            <strong>{clueCategories.length}가지 단서를 확인하세요</strong>
            <p>
              {clueCategories.join("·")}를 비교해요.
              <br />
              보라는 정확히 일치, 노랑은 같은 포지션 계열, 분홍은 불일치예요.
            </p>
            <div className="legend">
              <span>
                <i className="match-dot" />
                일치
              </span>
              <span>
                <i className="near-dot" />
                같은 계열
              </span>
              <span>
                <i className="miss-dot" />
                불일치
              </span>
            </div>
          </div>
        </li>
        <li>
          <span>03</span>
          <div>
            <strong>정답을 좁혀보세요</strong>
            <p>
              출생연도·등번호·시장가치의 화살표는 정답의 값이 더 높은지, 낮은지
              알려줘요.
            </p>
          </div>
        </li>
      </ol>
      <div className="example-grid">
        <Tile
          clue={{
            key: "country",
            label: "국적",
            value: "프랑스",
            match: "exact",
          }}
        />
        <Tile
          clue={{
            key: "position",
            label: "포지션",
            value: "CM",
            match: "near",
          }}
        />
        <Tile
          clue={{
            key: "value",
            label: "시장가치",
            value: "약 746억 원",
            match: "miss",
            direction: "up",
          }}
        />
      </div>
      <p className="example-caption">
        예시: 프랑스 선수이자 미드필더이고, 시장가치는 약 746억 원보다 높아요.
      </p>
      <div className="mode-explanation">
        <strong>오늘의 챌린지</strong>
        <p>
          프리미어리그, 시장가치 약 45억 원 이상 선수 중 매일 1명. 한국 시간
          자정에 새로운 문제가 열려요.
        </p>
        <p>
          <p>프로모션 중!</p>
          오늘의 챌린지를 5일 연속
          성공할 때마다 500포인트를 지급해요. 실패하거나 하루를 쉬면 연속
          기록이 초기화돼요. 달성 후 지급하며, 예산이
          소진되면 일찍 종료될 수 있어요.
        </p>
        <strong>무제한 모드</strong>
        <p>
          수집 시점의 세계 시장가치 상위 250명 중 한 명. 원하는 만큼 계속
          도전하세요.
        </p>
        <p>시장가치는 1유로 = 1,492.35원으로 환산한 금액이에요.</p>
      </div>
    </>
  );
}
function CollectionContent({
  collections,
  dailyCollectionDates,
  selected,
  onSelect,
}: {
  collections: Record<Mode, string[]>;
  dailyCollectionDates: Record<string, string>;
  selected: Mode;
  onSelect: (mode: Mode) => void;
}) {
  const ids = collections[selected];
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const selectedPlayer =
    selectedCardId && ids.includes(selectedCardId)
      ? playerMap.get(selectedCardId)
      : null;
  return (
    <>
      <div className="collection-tabs" role="group" aria-label="도감 선택">
        <button
          type="button"
          aria-pressed={selected === "daily"}
          onClick={() => {
            setSelectedCardId(null);
            onSelect("daily");
          }}
        >
          프리미어리그
        </button>
        <button
          type="button"
          aria-pressed={selected === "unlimited"}
          onClick={() => {
            setSelectedCardId(null);
            onSelect("unlimited");
          }}
        >
          TOP 250
        </button>
      </div>
      <div className="collection-summary" role="status">
        <div>
          <span>{selected === "daily" ? "오늘의 챌린지" : "무제한 모드"}</span>
          <h3>{selected === "daily" ? "프리미어리그 도감" : "TOP 250 도감"}</h3>
        </div>
        <strong>
          {ids.length}<small> / {pools[selected].length}</small>
        </strong>
      </div>
      {selectedPlayer ? (
        <div className="collection-detail">
          <button
            type="button"
            className="collection-detail-back"
            onClick={() => setSelectedCardId(null)}
            autoFocus
          >
            <Icon name="chevron" />
            도감으로 돌아가기
          </button>
          <div className="collection-detail-card">
            <PlayerAvatar player={selectedPlayer} />
            <div className="collection-detail-info">
              <strong>{selectedPlayer.name}</strong>
              <span>{selectedPlayer.club}</span>
              {selected === "daily" && (
                <span>
                  {dailyCollectionDates[selectedPlayer.id]
                    ? `획득일 ${dailyCollectionDates[selectedPlayer.id].replaceAll("-", ".")}`
                    : "획득일 미기록"}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : ids.length === 0 ? (
        <p className="collection-empty">
          아직 수집한 선수가 없어요. 이 모드에서 정답을 맞히면 카드가 모여요.
        </p>
      ) : (
        <ul className="collection-grid">
          {[...ids].reverse().map((id) => {
            const player = playerMap.get(id);
            if (!player) return null;
            const date = dailyCollectionDates[id];
            return (
              <li className="collection-card" key={id}>
                <button
                  type="button"
                  className="collection-card-button"
                  onClick={() => setSelectedCardId(id)}
                  aria-label={`${player.name}, ${player.club}${selected === "daily" ? `, 획득일 ${date ?? "미기록"}` : ""}, 카드 보기`}
                >
                  <PlayerAvatar player={player} />
                  {selected === "daily" && (
                    <span className="collection-thumb-date" aria-hidden="true">
                      {date ? date.slice(5).replace("-", ".") : "미기록"}
                    </span>
                  )}
                  <div className="collection-card-info">
                    <strong>{player.name}</strong>
                    <span>{player.club}</span>
                    {selected === "daily" && (
                      <span className="collection-card-date">
                        {date ? `획득일 ${date.replaceAll("-", ".")}` : "획득일 미기록"}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
function CollectionAnimation({
  player,
  mode,
  iconRef,
  onComplete,
}: {
  player: Player;
  mode: Mode;
  iconRef: RefObject<HTMLButtonElement | null>;
  onComplete: () => void;
}) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const bookAnchorRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLSpanElement>(null);
  const useVisibleSourceRef = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    const updatePath = () => {
      const scene = sceneRef.current;
      const card = cardRef.current;
      const book = bookAnchorRef.current;
      const icon = iconRef.current;
      const source = sourceRef.current;
      if (!scene || !card || !book || !icon || !source) return;
      const sceneRect = scene.getBoundingClientRect();
      const bookRect = book.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const iconX = iconRect.left + iconRect.width / 2;
      const iconY = iconRect.top + iconRect.height / 2;
      if (useVisibleSourceRef.current === null)
        useVisibleSourceRef.current =
          iconX < sceneRect.left ||
          iconX > sceneRect.right ||
          iconY < sceneRect.top ||
          iconY > sceneRect.bottom;
      source.style.left = `${Math.min(Math.max(iconX - sceneRect.left - 22, 12), Math.max(12, sceneRect.width - 56))}px`;
      source.style.opacity = useVisibleSourceRef.current ? "1" : "0";
      const originRect = useVisibleSourceRef.current
        ? source.getBoundingClientRect()
        : iconRect;
      scene.style.setProperty(
        "--book-origin-x",
        `${originRect.left + originRect.width / 2 - (bookRect.left + bookRect.width / 2)}px`,
      );
      scene.style.setProperty(
        "--book-origin-y",
        `${originRect.top + originRect.height / 2 - (bookRect.top + bookRect.height / 2)}px`,
      );
      scene.style.setProperty(
        "--flight-y",
        `${bookRect.top + 58 - (sceneRect.top + card.offsetTop)}px`,
      );
    };
    updatePath();
    const frame = requestAnimationFrame(updatePath);
    window.addEventListener("resize", updatePath);
    window.addEventListener("scroll", updatePath, { passive: true });
    window.visualViewport?.addEventListener("resize", updatePath);
    window.visualViewport?.addEventListener("scroll", updatePath);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePath);
      window.removeEventListener("scroll", updatePath);
      window.visualViewport?.removeEventListener("resize", updatePath);
      window.visualViewport?.removeEventListener("scroll", updatePath);
    };
  }, [iconRef]);
  return (
    <div
      ref={sceneRef}
      className="collection-animation"
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) onComplete();
      }}
    >
      <div ref={cardRef} className="collection-animation-card">
        <PlayerAvatar player={player} />
        <div className="collection-animation-card-info">
          <span>선수카드</span>
          <strong>{player.name}</strong>
          <small>{player.club}</small>
        </div>
      </div>
      <span ref={sourceRef} className="collection-animation-source">
        <Icon name="book" />
      </span>
      <div ref={bookAnchorRef} className="collection-animation-book-anchor">
        <div className="collection-animation-book">
          <svg viewBox="0 0 200 115" fill="none" aria-hidden="true">
            <ellipse cx="100" cy="101" rx="90" ry="10" fill="currentColor" opacity=".16" />
            <path
              d="M10 22Q51 8 100 26q49-18 90-4v70q-44-12-90 8-46-20-90-8Z"
              fill="var(--accent-soft)"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              d="M18 16Q59 5 100 25v67Q58 71 18 82Z"
              fill="var(--surface)"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M182 16q-41-11-82 9v67q42-21 82-10Z"
              fill="var(--surface)"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M100 25v67M30 36q28-5 55 6M30 51q28-5 55 6m85-21q-28-5-55 6m55 9q-28-5-55 6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
              opacity=".65"
            />
          </svg>
          <span>{mode === "daily" ? "프리미어리그 도감" : "TOP 250 도감"}</span>
        </div>
      </div>
    </div>
  );
}
export default function App() {
  const rewarded = useRewardedAd();
  const interstitial = useInterstitialAd(rewarded.settled);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "light" ? "#f4f6f9" : "#101722");
    try {
      localStorage.setItem("who-am-i-theme", theme);
    } catch {
      /* Theme still works without storage. */
    }
  }, [theme]);
  const [storageError, setStorageError] = useState(false);
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    try {
      return restore(localStorage.getItem(STORAGE_KEY));
    } catch {
      return restore(null);
    }
  });
  const [modal, setModal] = useState<ModalType>(null),
    [toast, setToast] = useState(""),
    [tick, setTick] = useState(Date.now());
  const [collectionTab, setCollectionTab] = useState<Mode>(state.mode);
  const collectionIconRef = useRef<HTMLButtonElement>(null);
  const [collectionAnimation, setCollectionAnimation] = useState<{
    player: Player;
    mode: Mode;
    roundKey: string;
  } | null>(null);
  const [promotionOutcome, setPromotionOutcome] = useState<{
    date: string;
    outcome: Exclude<VisiblePromotionOutcome, null>;
  } | null>(null);
  const openCollection = (mode: Mode) => {
    setCollectionTab(mode);
    setModal("collection");
  };
  const [copied, setCopied] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const update = () => setShowScrollTop(window.scrollY > 320);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  const round = activeRound(state),
    answer = playerMap.get(round.answer)!,
    rewardOffer = round.status === "rewardOffer",
    finished = round.status !== "playing" && !rewardOffer,
    attemptLimit = round.maxAttempts ?? MAX_ATTEMPTS,
    averageAttempts = averageWinningAttempts(state.stats),
    done = state.daily.filter(
      (r) => r.status !== "playing" && r.status !== "rewardOffer",
    ).length;
  const roundKey = `${state.date}:${state.mode}:${state.mode === "daily" ? state.active : "unlimited"}:${round.answer}`;
  useEffect(() => {
    setCollectionAnimation((current) =>
      current?.roundKey === roundKey ? current : null,
    );
  }, [roundKey]);
  useEffect(() => {
    if (!collectionAnimation) return;
    const timer = window.setTimeout(() => setCollectionAnimation(null), 3900);
    return () => window.clearTimeout(timer);
  }, [collectionAnimation]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [state]);
  useEffect(() => {
    const date = state.promotion.milestoneDate;
    if (!date || state.date < PROMOTION_START_DATE || state.date > PROMOTION_END_DATE)
      return;
    let active = true;
    setPromotionOutcome({ date, outcome: { status: "pending" } });
    void grantPromotionMilestone(date).then((outcome) => {
      if (active) setPromotionOutcome({ date, outcome });
    });
    return () => {
      active = false;
    };
  }, [state.promotion.milestoneDate, state.date]);
  useEffect(() => {
    const update = () => {
      setTick(Date.now());
      dispatch({ type: "day", date: dayKey() });
    };
    const timer = setInterval(update, 1000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const tomorrow = Date.parse(`${state.date}T00:00:00+09:00`) + 86400000;
  const seconds = Math.max(0, Math.floor((tomorrow - tick) / 1000)),
    countdown = [
      Math.floor(seconds / 3600),
      Math.floor(seconds / 60) % 60,
      seconds % 60,
    ]
      .map((v) => String(v).padStart(2, "0"))
      .join(":");
  const share = async () => {
    const text = shareText(state);
    try {
      await navigator.clipboard.writeText(text);
      setToast("결과를 복사했어요. 친구에게 공유해 보세요.");
      setCopied(true);
    } catch {
      setModal("share");
    }
  };
  const selectMode = (mode: Mode) => {
    dispatch({ type: "mode", mode });
    setCopied(false);
  };
  const submitGuess = (id: string) => {
    if (
      id === round.answer &&
      round.status === "playing" &&
      !round.guesses.includes(id) &&
      round.guesses.length < attemptLimit &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setCollectionAnimation({ player: answer, mode: state.mode, roundKey });
    }
    dispatch({ type: "guess", id });
  };
  const retryPromotion = (date: string) => {
    setPromotionOutcome({ date, outcome: { status: "pending" } });
    void grantPromotionMilestone(date).then((outcome) =>
      setPromotionOutcome({ date, outcome }),
    );
  };
  const promotionActive =
    state.date >= PROMOTION_START_DATE && state.date <= PROMOTION_END_DATE;
  const promotionProgress =
    state.promotion.streak > 0 &&
    state.promotion.streak % PROMOTION_STREAK_DAYS === 0
      ? PROMOTION_STREAK_DAYS
      : state.promotion.streak % PROMOTION_STREAK_DAYS;
  const achievedPromotionToday =
    state.mode === "daily" &&
    round.status === "won" &&
    state.promotion.milestoneDate === state.date;
  const currentPromotionOutcome =
    promotionOutcome?.date === state.date ? promotionOutcome.outcome : null;
  return (
    <div className="app-shell">
      <main className="page">
        <section className="hero" aria-labelledby="game-title">
          <div className="hero-copy">
            <div className="hero-top">
              <div className="eyebrow">
                <span className="live-dot" />
                <span className="eyebrow-label">FOOTBALL IDENTITY QUIZ</span>
              </div>
              <div className="hero-utilities">
                <button
                  ref={collectionIconRef}
                  type="button"
                  className="icon-button"
                  onClick={() => openCollection(state.mode)}
                  aria-label={`선수 도감 보기, ${state.collections.daily.length + state.collections.unlimited.length}장 수집`}
                  title="선수 도감"
                >
                  <Icon name="book" />
                </button>
                <button
                  type="button"
                  className="icon-button theme-toggle"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  aria-label={
                    theme === "dark" ? "밝은 테마로 전환" : "어두운 테마로 전환"
                  }
                  title={
                    theme === "dark" ? "밝은 테마로 전환" : "어두운 테마로 전환"
                  }
                >
                  <Icon name={theme === "dark" ? "sun" : "moon"} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setModal("stats")}
                  aria-label="내 기록 보기"
                >
                  <Icon name="chart" />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setModal("help")}
                  aria-label="게임 방법 보기"
                >
                  <Icon name="help" />
                </button>
              </div>
            </div>
            <h1 id="game-title">
              WHO <span className="logo-am">AM</span> I
              <span className="logo-question">?</span>
            </h1>
            <p className="hero-korean">이 선수, 누구일까요?</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <ParticleBall theme={theme} />
          </div>
        </section>
        {PROMOTION_TEST_MODE && (
          <section className="promotion-test-banner" aria-label="프로모션 테스트">
            <div>
              <strong>프로모션 테스트 모드</strong>
              <p>5일을 기다리지 않고 테스트 코드를 1회 호출해요.</p>
              {currentPromotionOutcome && (
                <p role="status">{promotionOutcomeText(currentPromotionOutcome)}</p>
              )}
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={currentPromotionOutcome?.status === "pending"}
              onClick={() => retryPromotion(state.date)}
            >
              테스트 포인트 지급 확인
            </button>
          </section>
        )}
        <div className="mode-bar">
          <div className="mode-tabs" role="tablist" aria-label="게임 모드">
            <button
              id="daily-tab"
              role="tab"
              aria-selected={state.mode === "daily"}
              aria-controls="game-panel"
              className={state.mode === "daily" ? "selected" : ""}
              onClick={() => selectMode("daily")}
            >
              <Icon name="calendar" />
              오늘의 챌린지<span className="tab-count">{DAILY_COUNT}</span>
            </button>
            <button
              id="unlimited-tab"
              role="tab"
              aria-selected={state.mode === "unlimited"}
              aria-controls="game-panel"
              className={state.mode === "unlimited" ? "selected" : ""}
              onClick={() => selectMode("unlimited")}
            >
              <Icon name="infinity" />
              무제한
            </button>
          </div>
          <span className="date-label">
            {state.date.replaceAll("-", ".")} <span className="date-dot" />{" "}
            새로운 도전이 기다려요
          </span>
        </div>
        {storageError && (
          <p className="storage-warning" role="status">
            브라우저에 기록을 저장할 수 없어요. 현재 화면에서는 계속 플레이할 수
            있어요.
          </p>
        )}
        <div className="content-grid">
          <section
            className="game-panel"
            id="game-panel"
            role="tabpanel"
            aria-labelledby={
              state.mode === "daily" ? "daily-tab" : "unlimited-tab"
            }
          >
            <div className="board-top">
              <div className="pool-badges">
                <span className="pool-badge">
                  <span
                    className={
                      state.mode === "daily"
                        ? "pool-symbol premier-league-symbol"
                        : "pool-symbol"
                    }
                    aria-hidden="true"
                  >
                    {state.mode === "daily" ? (
                      <img
                        src="/premier-league.svg"
                        width="24"
                        height="24"
                        alt=""
                      />
                    ) : (
                      "W"
                    )}
                  </span>
                  {state.mode === "daily" ? "프리미어리그" : "월드 클래스"}
                </span>
                {/*<span className="pool-detail">*/}
                {/*  {state.mode === "daily"*/}
                {/*    ? ``*/}
                {/*    : `TOP ${pools.unlimited.length}`}*/}
                {/*</span>*/}
              </div>
              {state.mode === "daily" ? (
                <div
                  className="daily-progress"
                  aria-label={`${done}/${DAILY_COUNT} 완료`}
                >
                  {state.daily.map((r, i) => (
                    <span
                      key={i}
                      className={`day-step ${state.active === i ? "current" : ""} ${r.status === "won" ? "solved" : ""} ${r.status === "lost" || r.status === "revealed" ? "failed" : ""}`}
                      aria-label={`${i + 1}번째 문제${r.status !== "playing" && r.status !== "rewardOffer" ? " 완료" : ""}`}
                    >
                      {r.status === "won" ? (
                        <Icon name="check" width="15" height="15" />
                      ) : (
                        i + 1
                      )}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="unlimited-label">
                  <Icon name="infinity" />
                  끝없는 도전
                </span>
              )}
            </div>
            <div className="question-area">
              <span className="section-kicker">
                {state.mode === "daily"
                  ? "DAILY CHALLENGE"
                  : "UNLIMITED CHALLENGE"}
              </span>
              <h2>
                {rewardOffer
                  ? "기회가 더 필요하신가요?"
                  : finished
                    ? round.status === "won"
                      ? "정답을 찾았어요!"
                      : "정답을 확인해 보세요"
                    : "어떤 선수일까요?"}
              </h2>
              <p>
                {rewardOffer
                  ? "정답은 아직 공개되지 않았어요."
                  : finished
                    ? "단서를 연결한 당신의 추측을 돌아보세요."
                    : "단서를 모아 정답에 가까워져 보세요."}
              </p>
            </div>
            {round.status === "playing" && (
              <Search
                key={`${state.mode}-${round.answer}`}
                mode={state.mode}
                guesses={round.guesses}
                onGuess={submitGuess}
              />
            )}
            {rewardOffer && (
              <div className="result-card reward-offer" role="status">
                <h3>현재 기회를 모두 사용했어요</h3>
                <p className="result-message">
                  {rewarded.available
                    ? `광고를 끝까지 보면 1번 더 도전할 수 있어요. 이번 문제에서 광고를 ${MAX_REWARDED_ADS - (round.rewardAdsWatched ?? 0)}번 더 볼 수 있어요.`
                    : "정답을 확인하고 이번 도전을 마칠 수 있어요."}
                </p>
                <div className="result-buttons">
                  {rewarded.available && (
                    <button
                      className="button primary"
                      disabled={!rewarded.ready || rewarded.showing}
                      onClick={() =>
                        rewarded.showIfReady(() =>
                          dispatch({
                            type: "grantReward",
                            answer: round.answer,
                            mode: state.mode,
                            date: state.date,
                            offerAtGuess: round.guesses.length,
                          }),
                        )
                      }
                    >
                      {rewarded.ready
                        ? "광고 보고 1번 더 도전"
                        : "광고 준비 중"}
                    </button>
                  )}
                  <button
                    className="button secondary"
                    onClick={() =>
                      dispatch({
                        type: "finish",
                        answer: round.answer,
                        mode: state.mode,
                        date: state.date,
                        offerAtGuess: round.guesses.length,
                      })
                    }
                  >
                    정답 확인하기
                  </button>
                </div>
              </div>
            )}
            {finished && (
              <div
                className={`result-card ${round.status === "won" ? "result-won" : ""}`}
                role="status"
              >
                <div className="result-player">
                  <PlayerAvatar player={answer} />
                  <div>
                    <span className="result-eyebrow">
                      {round.status === "won"
                        ? "GREAT SCOUTING"
                        : round.status === "revealed"
                          ? "ANSWER REVEALED"
                          : "FULL TIME"}
                    </span>
                    <h3>{answer.name}</h3>
                    <p>{answer.club}</p>
                  </div>
                  <span className="result-score">
                    {round.status === "won"
                      ? `${round.guesses.length}/${attemptLimit}`
                      : `X/${attemptLimit}`}
                  </span>
                </div>
                <p className="result-message">
                  {round.status === "won"
                    ? `${round.guesses.length}번 만에 선수를 맞혔어요.`
                    : round.status === "revealed"
                      ? "정답 공개로 이번 도전을 마쳤어요."
                      : "이번 도전을 마쳤어요. 다음 선수에게 도전해 보세요."}
                </p>
                {achievedPromotionToday && (
                  <div className="promotion-result" role="status">
                    <strong>5일 연속 성공 보상</strong>
                    <p>{promotionOutcomeText(currentPromotionOutcome)}</p>
                    {currentPromotionOutcome?.status === "retryable" && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => retryPromotion(state.date)}
                      >
                        지급 다시 확인
                      </button>
                    )}
                  </div>
                )}
                {round.status === "won" && (
                  <button
                    type="button"
                    className="collection-earned"
                    onClick={() => openCollection(state.mode)}
                  >
                    <Icon name="book" />
                    <span>이 선수카드를 도감에서 확인하세요</span>
                  </button>
                )}
                <div className="result-buttons">
                  <button className="button secondary" onClick={share}>
                    <Icon name={copied ? "check" : "share"} />
                    {copied ? "복사 완료" : "결과 공유"}
                  </button>
                  {state.mode === "unlimited" ||
                  state.active < DAILY_COUNT - 1 ? (
                    <button
                      className="button primary"
                      onClick={() => {
                        if (
                          state.mode === "unlimited" &&
                          (round.rewardAdsWatched ?? 0) === 0
                        )
                          interstitial.showIfReady();
                        dispatch({ type: "next" });
                        setCopied(false);
                      }}
                    >
                      {state.mode === "unlimited"
                        ? interstitial.ready &&
                          (round.rewardAdsWatched ?? 0) === 0
                          ? "다음 선수 도전 · 광고"
                          : "다음 선수 도전"
                        : "다음 문제"}
                      <Icon name="chevron" />
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      onClick={() => selectMode("unlimited")}
                    >
                      무제한으로 계속하기
                      <Icon name="chevron" />
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="attempts-caption">
              <span>
                <span className="attempt-number">
                  {String(round.guesses.length).padStart(2, "0")}
                </span>{" "}
                / {String(attemptLimit).padStart(2, "0")}{" "}
                <span className="attempt-label">시도</span>
              </span>
              <div
                className="attempt-dots"
                aria-label={`${Math.max(0, attemptLimit - round.guesses.length)}번의 기회 남음`}
              >
                {Array.from({ length: attemptLimit }, (_, i) => (
                  <i
                    key={i}
                    className={i < round.guesses.length ? "used" : ""}
                  />
                ))}
              </div>
            </div>
            <div
              className="guess-history"
              aria-live="polite"
              aria-label="추측 기록"
            >
              {finished && round.status !== "won" && (
                <article className="guess-row">
                  <div className="guess-row-title">
                    <strong>정답의 선수 정보</strong>
                    <span className="guess-status">{answer.name}</span>
                  </div>
                  <div className={`clue-grid clue-grid-${state.mode}`}>
                    {compare(answer, answer, state.mode).map((c) => (
                      <Tile key={c.key} clue={c} />
                    ))}
                  </div>
                </article>
              )}
              {round.guesses.length ? (
                <>
                  {[...round.guesses].reverse().map((id, index) => {
                    const p = playerMap.get(id)!;
                    return (
                      <article className="guess-row" key={id}>
                        <div className="guess-row-title">
                          <div>
                            <span className="guess-order">
                              {String(round.guesses.length - index).padStart(
                                2,
                                "0",
                              )}
                            </span>
                            <strong>{p.name}</strong>
                            <span className="guess-latin">{p.latin}</span>
                          </div>
                          <span className="guess-status">
                            {id === round.answer ? (
                              <>
                                <Icon name="check" />
                                정답
                              </>
                            ) : (
                              `${round.guesses.length - index}번째 추측`
                            )}
                          </span>
                        </div>
                        <div className={`clue-grid clue-grid-${state.mode}`}>
                          {compare(p, answer, state.mode).map((c) => (
                            <Tile key={c.key} clue={c} />
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </>
              ) : (
                round.status === "playing" && (
                  <div className="first-guess">
                    <div className="empty-pitch">
                      <div className="pitch-line" />
                      <div className="pitch-circle" />
                      <Icon name="search" width="26" height="26" />
                    </div>
                    <strong>첫 번째 추측이 킥오프예요</strong>
                    <p>
                      떠오르는 선수부터 시작해 보세요.
                      <br />
                      추측할 때마다 단서가 공개돼요.
                    </p>
                    <div
                      className={`empty-categories empty-categories-${state.mode}`}
                    >
                      {categoriesForMode(state.mode).map((c, i) => (
                        <span key={c}>
                          {c}
                          <i>{String(i + 1).padStart(2, "0")}</i>
                        </span>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
            <div className="board-footer">
              <span className="footer-legend">
                <i className="match-dot" />
                일치
                <i className="near-dot" />
                같은 계열
                <i className="miss-dot" />
                불일치
              </span>
              {finished && (
                <span className="finished-label">
                  이번 도전 완료
                  <Icon name="check" width="16" height="16" />
                </span>
              )}
            </div>
          </section>
          <aside className="side-panel">
            {/*<section className="how-card">*/}
            {/*  <div className="aside-heading">*/}
            {/*    <span className="aside-icon">*/}
            {/*      <Icon name="help" />*/}
            {/*    </span>*/}
            {/*    <h2>이렇게 플레이해요</h2>*/}
            {/*  </div>*/}
            {/*  <div className="mini-step">*/}
            {/*    <span>1</span>*/}
            {/*    <div>*/}
            {/*      <strong>선수를 떠올리세요</strong>*/}
            {/*      <p>*/}
            {/*        이름을 검색한 뒤<br />*/}
            {/*        목록에서 선택하세요.*/}
            {/*      </p>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*  <div className="mini-step">*/}
            {/*    <span>2</span>*/}
            {/*    <div>*/}
            {/*      <strong>6가지 단서를 읽으세요</strong>*/}
            {/*      <p>*/}
            {/*        색은 일치 여부를,*/}
            {/*        <br />*/}
            {/*        화살표는 방향을 알려줘요.*/}
            {/*      </p>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*  <div className="mini-step">*/}
            {/*    <span>3</span>*/}
            {/*    <div>*/}
            {/*      <strong>기본 5번 안에 맞혀보세요</strong>*/}
            {/*      <p>*/}
            {/*        단서를 조합하면*/}
            {/*        <br />*/}
            {/*        정답이 가까워져요.*/}
            {/*      </p>*/}
            {/*    </div>*/}
            {/*  </div>*/}
            {/*  <button className="aside-link" onClick={() => setModal("help")}>*/}
            {/*    자세한 게임 방법*/}
            {/*    <Icon name="chevron" width="17" height="17" />*/}
            {/*  </button>*/}
            {/*</section>*/}
            <div className="daily-card-row">
              <section className="daily-card">
                <span className="section-kicker">
                  EVERY DAY, A NEW CHALLENGE
                </span>
                <div className="daily-card-bottom">
                  <div>
                    <span>오늘의 진행</span>
                    <strong>
                      {done}
                      <small> / {DAILY_COUNT}</small>
                    </strong>
                  </div>
                  <div className="countdown">
                    <span>다음 도전까지</span>
                    <strong>{countdown}</strong>
                  </div>
                </div>
                <div className="daily-track">
                  <span style={{ width: `${(done / DAILY_COUNT) * 100}%` }} />
                </div>
                {promotionActive && (
                  <div className="promotion-progress">
                    <div>
                      <strong>5일 연속 성공 보상</strong>
                      <span>{promotionProgress}/{PROMOTION_STREAK_DAYS}일</span>
                    </div>
                    <p>5일마다 500포인트 · 실패하거나 하루 쉬면 초기화</p>
                    <p>12월 31일까지 · 예산 소진 시 조기 종료</p>
                  </div>
                )}
              </section>
              <button
                type="button"
                className="records-icon"
                aria-label="나의 스카우팅 기록 보기"
                title="스카우팅 기록"
                onClick={() => setModal("stats")}
              >
                <Icon name="chart" />
                <span>스카우팅 기록</span>
              </button>
            </div>
          </aside>
        </div>
        {/*<footer className="page-footer">*/}
        {/*  <div className="footer-wordmark">*/}
        {/*    WHO AM I<span>?</span>*/}
        {/*  </div>*/}
        {/*  <p>6가지 단서. 기본 5번의 기회.</p>*/}
        {/*</footer>*/}
      </main>
      {showScrollTop && !modal && !toast && (
        <button
          type="button"
          className="scroll-top"
          aria-label="맨 위로 이동"
          title="맨 위로 이동"
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "auto"
                : "smooth",
            })
          }
        >
          <Icon name="arrow" />
        </button>
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" />
          {toast}
        </div>
      )}
      {collectionAnimation && (
        <CollectionAnimation
          key={collectionAnimation.roundKey}
          player={collectionAnimation.player}
          mode={collectionAnimation.mode}
          iconRef={collectionIconRef}
          onComplete={() => setCollectionAnimation(null)}
        />
      )}
      {modal && (
        <Modal
          title={
            modal === "help"
              ? "게임 방법"
              : modal === "stats"
                ? "나의 스카우팅 기록"
                : modal === "collection"
                  ? "선수 도감"
                  : modal === "reveal"
                    ? "정답을 공개할까요?"
                    : "결과 공유"
          }
          onClose={() => setModal(null)}
        >
          {modal === "help" ? (
            <HelpContent mode={state.mode} />
          ) : modal === "collection" ? (
            <CollectionContent
              collections={state.collections}
              dailyCollectionDates={state.dailyCollectionDates}
              selected={collectionTab}
              onSelect={setCollectionTab}
            />
          ) : modal === "reveal" ? (
            <>
              <p className="modal-intro">
                정답을 공개하면 이번 문제는 미해결로 기록되고, 남은 기회를
                사용할 수 없어요.
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => setModal(null)}
                >
                  계속 추측하기
                </button>
                <button
                  className="button primary"
                  onClick={() => {
                    dispatch({ type: "reveal" });
                    setModal(null);
                  }}
                >
                  정답 공개하기
                </button>
              </div>
            </>
          ) : modal === "share" ? (
            <>
              <p className="modal-intro">
                아래 결과를 복사해 친구에게 공유하세요.
              </p>
              <textarea
                className="share-fallback"
                aria-label="공유할 결과"
                readOnly
                value={shareText(state)}
                onFocus={(e) => e.target.select()}
              />
            </>
          ) : (
            <>
              <div className="stats-grid">
                {[
                  [state.stats.played, "완료한 도전"],
                  [
                    state.stats.played
                      ? `${Math.round((state.stats.won / state.stats.played) * 100)}%`
                      : "—",
                    "승률",
                  ],
                  [
                    averageAttempts === null
                      ? "—"
                      : `${averageAttempts.toFixed(1)}회`,
                    "평균 시도 횟수",
                  ],
                  [state.stats.streak, "현재 연승"],
                  [state.stats.best, "최고 연승"],
                ].map(([v, label]) => (
                  <div
                    key={label}
                    className={
                      label === "평균 시도 횟수" ? "stats-average" : undefined
                    }
                  >
                    <strong>{v}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <h3 className="distribution-title">몇 번 만에 맞혔나요?</h3>
              <div className="distribution">
                {state.stats.distribution
                  .slice(0, MAX_TOTAL_ATTEMPTS)
                  .map((n, i) => (
                    <div key={i}>
                      <span>{i + 1}</span>
                      <div
                        className="distribution-bar"
                        style={{
                          width: `${Math.max(7, (n / Math.max(1, ...state.stats.distribution.slice(0, MAX_TOTAL_ATTEMPTS))) * 100)}%`,
                        }}
                      >
                        {n}
                      </div>
                    </div>
                  ))}
              </div>
              {!state.stats.played && (
                <p className="example-caption">
                  첫 번째 오늘의 챌린지를 완료하면 기록이 쌓여요.
                </p>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
