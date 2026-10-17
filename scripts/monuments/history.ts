/* Events of each place (sieges, earthquakes, rebuildings …) shown in the zone card's "History" tab.
   Writes walk.history into each manifest. `zones` = the places in the walk the event belongs to
   (they are listed first there); without zones the event is shown everywhere.
   conf: ok = well documented, mid = sources differ or are few (see CONTENT_TODO).
     npx tsx scripts/monuments/history.ts */
import fs from "node:fs";
import path from "node:path";
import type { HistoryEvent } from "../../lib/types";

const H: Record<string, HistoryEvent[]> = {
  "erivan-fortress": [
    { year: "1582–1583", conf: "mid", zones: ["street", "gate"], title: { az: "Qala tikilir", en: "The fortress is built" }, text: { az: "Osmanlı sərkərdəsi Fərhad Paşa Zəngi çayının yüksək sahilində qala tikdirir.", en: "The Ottoman commander Ferhat Pasha has a fortress built on the high bank of the Hrazdan." } },
    { year: "1679", conf: "ok", zones: ["street", "gate"], title: { az: "Zəlzələ", en: "Earthquake" }, text: { az: "Güclü zəlzələ qalanı ağır zədələyir; qala sonra yenidən bərpa olunur.", en: "A strong earthquake badly damages the fortress; it is rebuilt afterwards." } },
    { year: "1804", conf: "ok", zones: ["gate", "court"], title: { az: "Birinci rus mühasirəsi", en: "First Russian siege" }, text: { az: "General Sisianovun qoşunları qalanı mühasirəyə alır, amma ala bilmir.", en: "General Tsitsianov's troops besiege the fortress but fail to take it." } },
    { year: "1808", conf: "ok", zones: ["gate", "court"], title: { az: "İkinci rus mühasirəsi", en: "Second Russian siege" }, text: { az: "Qraf Qudoviçin mühasirəsi və hücumu da uğursuz olur.", en: "Count Gudovich's siege and assault fail as well." } },
    { year: "1827", conf: "ok", zones: ["gate", "court", "hall"], title: { az: "Qala alınır", en: "The fortress falls" }, text: { az: "Rus-İran müharibəsində general Paskeviçin qoşunları oktyabrda qalanı ələ keçirir. Mənbələrdə tarix köhnə və yeni təqvimlə fərqli göstərilir (1/13 oktyabr).", en: "In the Russo-Persian war General Paskevich's army takes the fortress in October. Sources give the date in the old or new calendar (1/13 October)." } },
    { year: "1827–1828", conf: "mid", zones: ["hall"], title: { az: "Sarayda tamaşa", en: "A play in the palace" }, text: { az: "Sərdar sarayının salonunda Qriboyedovun «Ağıldan bəla» komediyası oynanılır; ili mənbələrdə fərqli göstərilir.", en: "Griboyedov's comedy “Woe from Wit” is performed in a hall of the Sardar's Palace; sources give different years." } },
    { year: "1853", conf: "mid", title: { az: "Yeni zəlzələ", en: "Another earthquake" }, text: { az: "Daha bir zəlzələ qalanın tikililərini zədələyir; qala tədricən əhəmiyyətini itirir.", en: "Another earthquake damages the buildings; the fortress slowly loses its purpose." } },
    { year: "1865", conf: "mid", title: { az: "Ərazi satılır", en: "The site is sold" }, text: { az: "Qalanın ərazisi tacirə satılır; 1880-ci illərdə bir hissəsində konyak zavodu tikilir.", en: "The site is sold to a merchant; in the 1880s a brandy factory is built on part of it." } },
    { year: "1930-cu illər", conf: "mid", title: { az: "Qala sökülür", en: "The fortress is demolished" }, text: { az: "Qala demək olar ki, tamamilə sökülür; bir neçə divar parçası və Abbas Mirzə məscidinin skeleti qalır.", en: "The fortress is almost entirely demolished; a few wall fragments and the frame of the Abbas Mirza Mosque remain." } },
  ],
  shirvanshahs: [
    { year: "XV əsrin əvvəli", conf: "mid", title: { az: "Saray tikilir", en: "The palace is built" }, text: { az: "Şirvanşahlar I İbrahim və I Xəlilullah dövründə sarayı Bakıda tikdirirlər; başlanğıc tarixi mənbələrdə fərqli göstərilir.", en: "The Shirvanshahs Ibrahim I and Khalilullah I build the palace in Baku; sources disagree on when work began." } },
    { year: "1435", conf: "ok", zones: ["r3"], title: { az: "Ailə türbəsi", en: "The family tomb" }, text: { az: "I Xəlilullah anası və oğlu üçün türbə tikdirir.", en: "Khalilullah I builds a tomb for his mother and his son." } },
    { year: "1441", conf: "ok", title: { az: "Şah məscidi", en: "The Shah Mosque" }, text: { az: "Məscidin minarəsindəki kitabədə bu il yazılıb.", en: "The inscription on the mosque's minaret gives this year." } },
    { year: "1501", conf: "mid", title: { az: "Səfəvi yürüşü", en: "The Safavid conquest" }, text: { az: "Şah I İsmayıl Bakını alır; Şirvanşahların türbələri zədələnir.", en: "Shah Ismail I takes Baku; the Shirvanshahs' tombs are damaged." } },
    { year: "1723", conf: "mid", zones: ["court", "portal"], title: { az: "Bakı topa tutulur", en: "Baku bombarded" }, text: { az: "I Pyotrun Xəzər yürüşündə rus donanması Bakını topa tutur; sarayın yuxarı hissələri zədələnir.", en: "During Peter I's Caspian campaign the Russian fleet shells Baku; the upper parts of the palace are damaged." } },
    { year: "1806", conf: "ok", title: { az: "Rusiya imperiyası", en: "Russian Empire" }, text: { az: "Bakı Rusiya imperiyasının tərkibinə keçir.", en: "Baku passes to the Russian Empire." } },
    { year: "1964", conf: "ok", title: { az: "Muzey-qoruq", en: "Museum reserve" }, text: { az: "Saray kompleksi muzey-qoruq elan edilir.", en: "The palace complex becomes a museum reserve." } },
    { year: "2000", conf: "ok", title: { az: "UNESCO", en: "UNESCO" }, text: { az: "İçərişəhər Şirvanşahlar sarayı və Qız qalası ilə birlikdə Ümumdünya İrsi siyahısına daxil edilir.", en: "The Old City, with the Palace of the Shirvanshahs and the Maiden Tower, is inscribed on the World Heritage List." } },
  ],
  "maiden-tower": [
    { year: "XII əsr", conf: "mid", zones: ["plaza"], title: { az: "Kufi kitabə", en: "The Kufic inscription" }, text: { az: "Qalanın divarındakı kitabədə Məsud ibn Davudun adı var; kitabənin qaladan sonra qoyulub-qoyulmadığı mübahisəlidir.", en: "The inscription on the wall names Masud ibn Davud; whether it was added after the tower was built is debated." } },
    { year: "1806", conf: "ok", title: { az: "Rusiya imperiyası", en: "Russian Empire" }, text: { az: "Bakı Rusiya imperiyasının tərkibinə keçir.", en: "Baku passes to the Russian Empire." } },
    { year: "1858–1907", conf: "ok", zones: ["roof"], title: { az: "Mayak", en: "A lighthouse" }, text: { az: "Qala dənizçilər üçün mayak kimi istifadə olunur.", en: "The tower serves as a lighthouse for ships." } },
    { year: "1964", conf: "ok", title: { az: "Muzey", en: "Museum" }, text: { az: "Qala muzey kimi ziyarətçilərə açılır.", en: "The tower opens to visitors as a museum." } },
    { year: "2000", conf: "ok", title: { az: "UNESCO", en: "UNESCO" }, text: { az: "Qala İçərişəhərlə birlikdə Ümumdünya İrsi siyahısına daxil edilir.", en: "The tower is inscribed on the World Heritage List together with the Old City." } },
    { year: "2003–2009", conf: "mid", title: { az: "Təhlükədə olan irs", en: "Heritage in danger" }, text: { az: "İçərişəhər «Təhlükədə olan Ümumdünya İrsi» siyahısında olur; tarixlər mənbələrdə bir az fərqlidir.", en: "The Old City is on the List of World Heritage in Danger; sources differ slightly on the years." } },
  ],
  "kish-church": [
    { year: "e.ə. 3360–3030", conf: "ok", zones: ["altar"], title: { az: "Altarın altında ibadət yeri", en: "A cult site beneath the altar" }, text: { az: "Tunc dövrünün insanları burada qurban çuxuru qazır: içində kömür, yanmış sümüklər və iki qoyun ya keçi kəlləsi tapılıb.", en: "Bronze Age people dig a sacrificial pit here: charcoal, burnt bones and two sheep or goat skulls were found in it." } },
    { year: "I əsr", conf: "mid", title: { az: "Yelisey rəvayəti", en: "The legend of Elishe" }, text: { az: "Moisey Kalankatuklunun yazdığı rəvayətə görə Yelisey Gisdə kilsə tikir; Gisin Kiş olduğu çox vaxt qəbul edilir.", en: "According to a tradition recorded by Movses Kaghankatvatsi, Elishe builds a church at Gis, often identified with Kish." } },
    { year: "990–1160", conf: "ok", title: { az: "İndiki bina", en: "The present building" }, text: { az: "Radiokarbon analizinə görə indiki məbəd bu dövrdə tikilir.", en: "According to radiocarbon dating, the present church is built in this period." } },
    { year: "1260–1310", conf: "ok", zones: ["portal", "crypt"], title: { az: "Ruhani qəbri", en: "A cleric's tomb" }, text: { az: "Girişin altında sədəf xaç və qızıl bəzəklə yüksək rütbəli bir ruhani dəfn olunur.", en: "A high-ranking cleric is buried under the entrance with a mother-of-pearl cross and gold ornament." } },
    { year: "XVII əsr", conf: "mid", zones: ["altar"], title: { az: "Altar qaldırılır", en: "The chancel is raised" }, text: { az: "Storfjellə görə altar hissəsinin döşəməsi 30–40 sm-dən təxminən 1 metrə qaldırılır.", en: "According to Storfjell, the chancel floor is raised from 30–40 cm to about 1 metre." } },
    { year: "XIX əsr", conf: "mid", title: { az: "Təmir və dəyişikliklər", en: "Repairs and changes" }, text: { az: "Bir mənbəyə görə kilsə təmir edilir və memarlığı dəyişdirilir; sonra bina baxımsız qalır.", en: "According to one source the church is repaired and altered; later the building falls into neglect." } },
    { year: "2000–2003", conf: "ok", title: { az: "Qazıntı və bərpa", en: "Excavation and restoration" }, text: { az: "Azərbaycan–Norveç layihəsi məbədi araşdırır və bərpa edir; radiokarbon analizi binanın yaşını müəyyənləşdirir.", en: "An Azerbaijani–Norwegian project researches and restores the church; radiocarbon dating establishes the building's age." } },
    { year: "2003", conf: "ok", title: { az: "Muzey açılır", en: "The museum opens" }, text: { az: "Sentyabrın sonunda məbəd Qafqaz Albaniyasının erkən kilsə tarixinə həsr olunmuş muzey kimi açılır.", en: "At the end of September the church opens as a museum of the early church history of Caucasian Albania." } },
  ],
  "aghdam-mosque": [
    { year: "1868–1870", conf: "ok", title: { az: "Məscid tikilir", en: "The mosque is built" }, text: { az: "Məscidi Kərbəlayi Səfixan Qarabaği layihələndirir.", en: "The mosque is designed by Karbalayi Safikhan Karabakhi." } },
    { year: "1993", conf: "ok", title: { az: "Ağdam işğal olunur", en: "Aghdam is occupied" }, text: { az: "Şəhər dağıdılır; məscid xarabalıqların arasında ayaqda qalır.", en: "The town is destroyed; the mosque stays standing among the ruins." } },
    { year: "2020", conf: "ok", title: { az: "Ağdam qayıdır", en: "Aghdam returns" }, text: { az: "Noyabrda Ağdam Azərbaycana qaytarılır; məsciddə yenidən cümə namazı qılınır.", en: "In November Aghdam returns to Azerbaijan; Friday prayer is held in the mosque again." } },
    { year: "2022", conf: "ok", title: { az: "Bərpa başlayır", en: "Restoration begins" }, text: { az: "Mütəxəssislər orijinal materialları öyrənib məscidi bərpa etməyə başlayırlar.", en: "Experts study the original materials and begin restoring the mosque." } },
    { year: "2024", conf: "ok", title: { az: "Qapılar açılır", en: "The doors open" }, text: { az: "Aprel ayında bərpa olunmuş məscid yenidən açılır.", en: "In April the restored mosque reopens." } },
  ],
};

for (const [slug, events] of Object.entries(H)) {
  const file = path.join(process.cwd(), "content", "monuments", slug, "manifest.json");
  const m = JSON.parse(fs.readFileSync(file, "utf8"));
  m.walk.history = events;
  fs.writeFileSync(file, JSON.stringify(m, null, 1) + "\n");
  console.log(`[history] ${slug}: ${events.length} events`);
}
