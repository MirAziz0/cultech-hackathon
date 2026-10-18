import type { L } from "./types";

/* Architecture terms explained on hover. Azerbaijani `stems` match at the start of a word, so
   suffixed forms ("portalı", "kitabəsi", "günbəzli") are caught too; English `words` match whole
   words only (so "arch" doesn't fire inside "architect"). */
export interface Term { id: string; term: L; stems: string[]; words: string[]; def: L }

export const GLOSSARY: Term[] = [
  { id: "portal", term: { az: "Portal", en: "Portal" }, stems: ["portal"], words: ["portal", "portals"],
    def: { az: "Binanın bəzəkli əsas girişi — adətən hündür, tağlı taxça şəklində.", en: "A building's decorated main entrance, usually a tall arched recess." } },
  { id: "eyvan", term: { az: "Eyvan", en: "Iwan" }, stems: ["eyvan"], words: ["iwan", "iwans", "eyvan"],
    def: { az: "Bir tərəfi tamamilə açıq, tağla örtülmüş zal və ya artırma.", en: "A vaulted hall or porch that is open on one side." } },
  { id: "kitabe", term: { az: "Kitabə", en: "Inscription" }, stems: ["kitabə"], words: ["inscription", "inscriptions"],
    def: { az: "Binaya həkk olunmuş yazı: tikilmə tarixi, ustanın və ya hökmdarın adı.", en: "Text carved into a building: its date, or the name of the master builder or ruler." } },
  { id: "minare", term: { az: "Minarə", en: "Minaret" }, stems: ["minarə"], words: ["minaret", "minarets"],
    def: { az: "Məscidin yanında, azan verilən hündür qüllə.", en: "The tall tower beside a mosque from which the call to prayer is given." } },
  { id: "gunbez", term: { az: "Günbəz", en: "Dome" }, stems: ["günbəz"], words: ["dome", "domes", "domed"],
    def: { az: "Yarımkürə şəkilli tavan örtüyü.", en: "A hemispherical roof or ceiling." } },
  { id: "mehrab", term: { az: "Mehrab", en: "Mihrab" }, stems: ["mehrab"], words: ["mihrab", "mihrabs"],
    def: { az: "Məsciddə qibləni — Məkkə istiqamətini göstərən divar taxçası.", en: "The wall niche in a mosque that shows the direction of Mecca." } },
  { id: "turbe", term: { az: "Türbə", en: "Mausoleum" }, stems: ["türbə"], words: ["mausoleum", "mausoleums", "turbe"],
    def: { az: "Görkəmli şəxsin məzarı üzərində tikilmiş məqbərə.", en: "A tomb building raised over the grave of a notable person." } },
  { id: "divanxana", term: { az: "Divanxana", en: "Divankhana" }, stems: ["divanxana"], words: ["divankhana", "divanhane"],
    def: { az: "Hökmdarın qəbul, məsləhət və məhkəmə zalı.", en: "The ruler's hall for audiences, council and judgement." } },
  { id: "tag", term: { az: "Tağ", en: "Arch" }, stems: ["tağ"], words: ["arch", "arches", "arched"],
    def: { az: "Açırımın üstünü örtən qövs şəkilli konstruksiya.", en: "A curved structure spanning an opening." } },
  { id: "medrese", term: { az: "Mədrəsə", en: "Madrasa" }, stems: ["mədrəsə"], words: ["madrasa", "madrasah"],
    def: { az: "Dini və elmi təhsil verilən məktəb.", en: "A school for religious and scholarly learning." } },
  { id: "karvansara", term: { az: "Karvansara", en: "Caravanserai" }, stems: ["karvansara"], words: ["caravanserai", "caravanserais"],
    def: { az: "Yolçular və karvanlar üçün həyətli mehmanxana.", en: "A courtyard inn for travellers and their caravans." } },
  { id: "burc", term: { az: "Bürc", en: "Bastion" }, stems: ["bürc"], words: ["bastion", "bastions"],
    def: { az: "Qala divarından çıxan müdafiə qülləsi.", en: "A defensive tower projecting from a fortress wall." } },
  { id: "serdar", term: { az: "Sərdar", en: "Sardar" }, stems: ["sərdar"], words: ["sardar"],
    def: { az: "Xanlığın və ya qalanın hərbi hakimi, komandanı.", en: "The military governor or commander of a khanate or fortress." } },
  { id: "muqernes", term: { az: "Müqərnəs", en: "Muqarnas" }, stems: ["müqərnəs"], words: ["muqarnas"],
    def: { az: "Pətək kimi pilləli, sallanan tavan bəzəyi.", en: "Honeycomb-like stepped ornament hanging from a vault." } },
  { id: "sebeke", term: { az: "Şəbəkə", en: "Shebeke" }, stems: ["şəbəkə"], words: ["shebeke"],
    def: { az: "Mismarsız, kiçik taxta hissələrdən yığılan, rəngli şüşəli naxışlı pəncərə.", en: "A lattice window of small wooden pieces and coloured glass, assembled without nails or glue." } },
];

const LETTER = "a-zA-ZəƏğĞıIİöÖşŞüÜçÇ";
const longestFirst = (a: string, b: string) => b.length - a.length;
/** group 1: an Azerbaijani stem plus any suffix · group 2: an English whole word */
export const GLOSSARY_RE = new RegExp(
  `(?<![${LETTER}])(?:(${GLOSSARY.flatMap((t) => t.stems).sort(longestFirst).join("|")})[${LETTER}]*|(${GLOSSARY.flatMap((t) => t.words).sort(longestFirst).join("|")})(?![${LETTER}]))`,
  "giu",
);
const BY_STEM = new Map(GLOSSARY.flatMap((t) => [...t.stems, ...t.words].map((s) => [s.toLocaleLowerCase("az"), t] as const)));
export const termForStem = (stem: string) => BY_STEM.get(stem.toLocaleLowerCase("az"));
