import { useEffect, useRef, useState } from "react";
import {
  loadFullScreenAd,
  showFullScreenAd,
} from "@apps-in-toss/web-framework";

const TEST_ID = "ait-ad-test-interstitial-id";
const adGroupId = import.meta.env.DEV
  ? TEST_ID
  : import.meta.env.VITE_TOSS_INTERSTITIAL_AD_GROUP_ID;

export function useInterstitialAd() {
  const [ready, setReady] = useState(false);
  const showRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!adGroupId) return;
    let alive = true;
    let loaded = false;
    let unregisterLoad: (() => void) | undefined;
    let unregisterShow: (() => void) | undefined;
    try {
      if (!loadFullScreenAd.isSupported() || !showFullScreenAd.isSupported())
        return;
    } catch {
      return;
    }
    const markReady = (value: boolean) => {
      loaded = value;
      if (alive) setReady(value);
    };
    const load = () => {
      if (!alive) return;
      unregisterLoad?.();
      markReady(false);
      try {
        unregisterLoad = loadFullScreenAd({
          options: { adGroupId },
          onEvent: (event) => {
            if (event.type === "loaded" && alive) markReady(true);
          },
          onError: (error) => {
            if (alive) {
              markReady(false);
              console.warn("광고를 불러오지 못했어요.", error);
            }
          },
        });
      } catch (error) {
        markReady(false);
        console.warn("광고를 불러오지 못했어요.", error);
      }
    };
    showRef.current = () => {
      if (!alive || !loaded) return;
      markReady(false);
      unregisterLoad?.();
      unregisterLoad = undefined;
      unregisterShow?.();
      try {
        unregisterShow = showFullScreenAd({
          options: { adGroupId },
          onEvent: (event) => {
            if (!alive) return;
            if (event.type === "dismissed" || event.type === "failedToShow") {
              unregisterShow?.();
              unregisterShow = undefined;
              load();
            }
          },
          onError: (error) => {
            if (!alive) return;
            console.warn("광고를 표시하지 못했어요.", error);
            unregisterShow?.();
            unregisterShow = undefined;
            load();
          },
        });
      } catch (error) {
        console.warn("광고를 표시하지 못했어요.", error);
        load();
      }
    };
    load();
    return () => {
      alive = false;
      loaded = false;
      showRef.current = () => {};
      unregisterLoad?.();
      unregisterShow?.();
    };
  }, []);

  return { ready, showIfReady: () => showRef.current() };
}
