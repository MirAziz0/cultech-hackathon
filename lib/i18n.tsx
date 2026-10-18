"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { L, Lang } from "./types";

/* UI strings. Content strings live in the monument JSON as {az, en}. */
const UI = {
  brand: { az: "ZamanQapısı AI", en: "ZamanQapısı AI" },
  heroTitle: { az: "Tariximiz rəqəmsal dünyada", en: "Our history in the digital world" },
  heroSub: {
    az: "Azərbaycan memarlıq irsinə virtual səyahət: abidələri bu gün və öz dövründə gör, içəridə gəz, memarın özündən dinlə.",
    en: "A virtual journey through Azerbaijani architectural heritage: see monuments today and in their own era, walk inside, and listen to their architect.",
  },
  explore: { az: "Abidələr", en: "Monuments" },
  open: { az: "Aç", en: "Open" },
  walkInside: { az: "İçəridə gəz", en: "Walk inside" },
  talkArchitect: { az: "Memarla danış", en: "Talk to the architect" },
  lookInside: { az: "İçərisinə bax", en: "Look inside" },
  backOut: { az: "← Çölə çıx", en: "← Back outside" },
  backModel: { az: "← Maketə qayıt", en: "← Back to model" },
  home: { az: "← Bütün abidələr", en: "← All monuments" },
  buildings: { az: "Binalar", en: "Buildings" },
  reliability: { az: "Bərpanın etibarlılığı", en: "Reconstruction confidence" },
  facts: { az: "Faktlar və mənbələr", en: "Facts and sources" },
  photos: { az: "Real şəkillər", en: "Real photos" },
  realPhoto: { az: "Real şəkil", en: "Real photo" },
  morePhotos: { az: "Daha çox şəkil ↗", en: "More photos ↗" },
  source: { az: "Mənbə", en: "Source" },
  loading: { az: "Maket yüklənir…", en: "Loading model…" },
  loadFail: { az: "Maket yüklənmədi", en: "Model failed to load" },
  ar: { az: "AR-da bax", en: "View in AR" },
  arClose: { az: "Bağla", en: "Close" },
  tapHint: {
    az: "Binaya və ya siyahıdakı ada toxunun. Ümumi görünüşə qayıtmaq üçün maketə iki dəfə toxunun.",
    en: "Tap a building or a name in the list. Double-tap the model to return to the overview.",
  },
  walkHint: { az: "W A S D və ya oxlarla gəz · sürüşdürərək bax · Shift qaçış", en: "Walk with W A S D or arrows · drag to look · Shift to run" },
  confOk: { az: "Mövcuddur", en: "Standing" },
  confMid: { az: "Arxeoloji əsaslı", en: "Evidence-based" },
  confHyp: { az: "AI fərziyyəsi", en: "Hypothesis" },
  confOkLong: { az: "Bina bu gün də dayanır, forma müşahidəyə əsaslanır.", en: "The building still stands; the form is based on observation." },
  confMidLong: { az: "Qalıqlar, planlar, köhnə foto və təsvirlər əsasında bərpa.", en: "Reconstructed from remains, plans, old photos and descriptions." },
  confHypLong: { az: "Bağ, rəngli kaşı, mebel kimi detallar. Tarixçi təsdiqi lazımdır.", en: "Details such as gardens, tile colours, furniture. Needs a historian's review." },
  tellMe: { az: "Bu barədə danış", en: "Tell me about this" },
  ask: { az: "Memardan soruş…", en: "Ask the architect…" },
  send: { az: "Göndər", en: "Send" },
  mic: { az: "Səslə soruş", en: "Ask by voice" },
  listening: { az: "Dinləyirəm…", en: "Listening…" },
  mute: { az: "Səsi bağla", en: "Mute" },
  unmute: { az: "Səsi aç", en: "Unmute" },
  collapse: { az: "Memarı gizlət", en: "Hide architect" },
  expand: { az: "Memarı göstər", en: "Show architect" },
  thinking: { az: "Düşünürəm…", en: "Thinking…" },
  mockNote: { az: "Demo rejimi: hazır cavablar", en: "Demo mode: prepared answers" },
  close: { az: "Bağla", en: "Close" },
  prev: { az: "Əvvəlki", en: "Previous" },
  next: { az: "Növbəti", en: "Next" },
  enlarge: { az: "Şəkli böyüt", en: "Enlarge photo" },
  forward: { az: "İrəli", en: "Forward" },
  backward: { az: "Geri", en: "Back" },
  turnL: { az: "Sola dön", en: "Turn left" },
  turnR: { az: "Sağa dön", en: "Turn right" },
  era: { az: "Dövr", en: "Era" },
  map: { az: "Xəritə", en: "Map" },
  disclaimerGlobal: {
    az: "Bütün 3D modellər ölçülmüş data deyil, mənbələrə əsaslanan təxmini bərpadır. Hər hissənin etibarlılığı rənglə göstərilir.",
    en: "All 3D models are approximate reconstructions from sources, not measured data. Each part is labelled with its confidence.",
  },
  photoCredit: { az: "Şəkillər: Wikimedia Commons, müəlliflər və lisenziyalar göstərilib.", en: "Photos: Wikimedia Commons, authors and licenses credited." },
  needsCheck: { az: "yoxlanılmalıdır", en: "to be verified" },
  architectIntro: { az: "Memar", en: "Architect" },
  levels: { az: "Mərtəbə", en: "Level" },
  offline: { az: "Oflayn rejim", en: "Offline" },
} satisfies Record<string, L>;

export type UIKey = keyof typeof UI;

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "az", setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("az");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("zq-lang");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore after hydration
      if (saved === "en" || saved === "az") setLangState(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("zq-lang", l);
    } catch {}
  }, []);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}

/** localize a content string */
export function tr(s: L | undefined, lang: Lang): string {
  if (!s) return "";
  return (lang === "en" ? s.en : s.az) || s.az || s.en || "";
}

export function useT() {
  const { lang } = useLang();
  const t = useCallback((k: UIKey) => tr(UI[k], lang), [lang]);
  const c = useCallback((s: L | undefined) => tr(s, lang), [lang]);
  return { t, c, lang };
}

export const CONF_KEY = { ok: "confOk", mid: "confMid", hyp: "confHyp" } as const;
