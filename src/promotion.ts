import { Promotion } from "@apps-in-toss/web-framework";
import { PROMOTION_REWARD_POINTS } from "./promotionConfig";

export const PROMOTION_TEST_MODE =
  import.meta.env?.VITE_TOSS_PROMOTION_TEST === "true";

const LIVE_PROMOTION_CODE = "01M6MTZ229RXBF051JEHTH27HZ";
const PROMOTION_CODE = PROMOTION_TEST_MODE
  ? `TEST_${LIVE_PROMOTION_CODE}`
  : LIVE_PROMOTION_CODE;
const LEDGER_KEY = `who-am-i-promotion:v1:${PROMOTION_TEST_MODE ? "test" : "live"}`;

type RewardAttempt = { status: "attempted" | "paid"; key?: string };
type RewardLedger = Record<string, RewardAttempt>;
export type PromotionOutcome =
  | { status: "paid" }
  | { status: "unsupported" }
  | { status: "retryable"; code: string }
  | { status: "unavailable"; code: string }
  | { status: "uncertain" }
  | { status: "storageError" };

const inFlight = new Map<string, Promise<PromotionOutcome>>();

function readLedger(): RewardLedger {
  const raw = localStorage.getItem(LEDGER_KEY);
  if (raw === null) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid promotion ledger");
  const ledger = value as Record<string, unknown>;
  if (
    !Object.entries(ledger).every(
      ([date, attempt]) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        attempt !== null &&
        typeof attempt === "object" &&
        ["attempted", "paid"].includes((attempt as RewardAttempt).status),
    )
  )
    throw new Error("Invalid promotion ledger");
  return ledger as RewardLedger;
}

function writeLedger(ledger: RewardLedger) {
  localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error)
    return String(error.code);
  return "UNKNOWN_ERROR";
}

async function grantMilestone(date: string): Promise<PromotionOutcome> {
  let ledger: RewardLedger;
  try {
    ledger = readLedger();
  } catch {
    return { status: "storageError" };
  }
  if (ledger[date]?.status === "paid") return { status: "paid" };
  if (ledger[date]?.status === "attempted") return { status: "uncertain" };
  try {
    if (!Promotion.grantReward.isSupported()) return { status: "unsupported" };
  } catch {
    return { status: "unsupported" };
  }
  try {
    // Persist before the bridge call: an interrupted response must not double-pay.
    writeLedger({ ...ledger, [date]: { status: "attempted" } });
  } catch {
    return { status: "storageError" };
  }
  try {
    const result = await Promotion.grantReward({
      promotionCode: PROMOTION_CODE,
      amount: PROMOTION_REWARD_POINTS,
    });
    try {
      writeLedger({ ...readLedger(), [date]: { status: "paid", key: result.key } });
    } catch {
      // The attempted marker already prevents another grant.
    }
    return { status: "paid" };
  } catch (error) {
    const code = errorCode(error);
    console.warn("프로모션 포인트 지급에 실패했어요.", error);
    if (code === "4113") {
      try {
        writeLedger({ ...readLedger(), [date]: { status: "paid" } });
      } catch {
        // The attempted marker already prevents another grant.
      }
      return { status: "paid" };
    }
    if (
      ["UNSUPPORTED_APP_VERSION", "4100", "4104", "4105", "4108", "4109", "4112", "4114"].includes(code)
    ) {
      // These errors mean no reward was issued, so this milestone may be tried again.
      try {
        const current = readLedger();
        delete current[date];
        writeLedger(current);
      } catch {
        return { status: "storageError" };
      }
      if (code === "UNSUPPORTED_APP_VERSION") return { status: "unsupported" };
      return {
        status: code === "4109" ? "retryable" : "unavailable",
        code,
      };
    }
    // Unknown failures may have completed on the Toss side; never retry blindly.
    return { status: "uncertain" };
  }
}

export function grantPromotionMilestone(date: string): Promise<PromotionOutcome> {
  const pending = inFlight.get(date);
  if (pending) return pending;
  const request = grantMilestone(date).finally(() => inFlight.delete(date));
  inFlight.set(date, request);
  return request;
}
