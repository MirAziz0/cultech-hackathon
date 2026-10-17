import hashlib, sys, urllib.parse, subprocess
def url(name, w):
    n = name.replace(" ", "_"); h = hashlib.md5(n.encode()).hexdigest()
    q = urllib.parse.quote(n)
    return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{q}/{w}px-{q}"
name, out = sys.argv[1], sys.argv[2]
for w in (960, 1280, 500, 330):
    r = subprocess.run(["curl","-sS","-A","ZamanQapisiDemo/1.0 (hackathon demo)","-o",out,"-w","%{http_code}","--max-time","30",url(name,w)],capture_output=True,text=True)
    if r.stdout == "200": print("ok", w, name); break
else: print("FAIL", r.stdout, name)
