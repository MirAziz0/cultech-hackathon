import hashlib, urllib.parse, subprocess, time, json, os
from PIL import Image
SEL = {
 "facade":["Şirvanşahlar kompleksində saray binasının qərb fasadı.JPG"],
 "dome":["Şirvanşahlar sarayının gümbəzi.JPG","Building of the Palace of the Shirvanshahs (dome).jpg"],
 "entry2":["Şirvanşahlar sarayının ikinci mərtəbə girişinin baştağı.JPG"],
 "stairs":["Stairs in the complex of the Palace of the Shirvanshahs.jpg"],
 "expo":["Şirvanşahlar sarayının ekspozisiyası.jpg"],
 "ceramic":["Ceramic crockery in Shirvanshah's Palace.jpg"],
 "silk":["Elxanilər dövrünə aid ipək parça qalığı (XIII əsr).JPG"],
 "bags":["Woven Bags on Display - Palace of the Shirvanshahs - Baku - Azerbaijan (17745209158).jpg"],
}
def get(name, out):
    n = name.replace(" ", "_"); h = hashlib.md5(n.encode()).hexdigest(); q = urllib.parse.quote(n)
    for attempt in range(6):
        for w in (1280, 1920, 500):
            u = f"https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{q}/{w}px-{q}"
            r = subprocess.run(["curl","-sS","-A","ZamanQapisiDemo/1.0 (hackathon demo; contact via user)","-o",out,"-w","%{http_code}","--max-time","40",u],capture_output=True,text=True)
            if r.stdout == "200": return w
            if r.stdout == "429": time.sleep(4 + attempt * 3); break
        time.sleep(1)
    return None
res = {}
os.makedirs("photos", exist_ok=True)
for key, names in SEL.items():
    for i, name in enumerate(names):
        raw = f"photos/raw_{key}_{i}"; out = f"photos/{key}_{i}.jpg"
        w = get(name, raw)
        if not w: print("FAIL", name); continue
        im = Image.open(raw).convert("RGB"); im.thumbnail((900, 900)); im.save(out, quality=78, optimize=True)
        res.setdefault(key, []).append({"file": out, "name": name, "size": im.size})
        print("ok", key, w, im.size, os.path.getsize(out)//1024, "KB", name)
        time.sleep(2)
json.dump(res, open("photos/index2.json","w"), ensure_ascii=False, indent=1)
