const express = require("express");
const axios   = require("axios");
const fs      = require("fs");
const path    = require("path");

const app = express();
app.use(express.json());

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Get a free API key at: https://www.last.fm/api/account/create
const LASTFM_API_KEY = process.env.LASTFM_API_KEY || "d614aa71c5c00c5d56776a1256f7a63c";
const LASTFM_BASE    = "https://ws.audioscrobbler.com/2.0/";

// ─── FILE DATABASE ────────────────────────────────────────────────────────────
// Stores { robloxUserId: "lastfmUsername" }
const DB_PATH = path.join(__dirname, "db.json");

function readDB() {
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, "{}");
  try { return JSON.parse(fs.readFileSync(DB_PATH, "utf8")); }
  catch { return {}; }
}

function saveLink(robloxUserId, lastfmUsername) {
  const db = readDB();
  db[String(robloxUserId)] = lastfmUsername.trim().toLowerCase();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getLastfmUsername(robloxUserId) {
  return readDB()[String(robloxUserId)] || null;
}

// ─── LAST.FM HELPERS ──────────────────────────────────────────────────────────
async function lfmGet(params) {
  const res = await axios.get(LASTFM_BASE, {
    params: { ...params, api_key: LASTFM_API_KEY, format: "json" },
    timeout: 8000,
  });
  return res.data;
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Link Last.fm to Roblox</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0a0a;color:#f0f0f0;font-family:'Segoe UI',sans-serif;
         display:flex;flex-direction:column;align-items:center;justify-content:center;
         min-height:100vh;padding:20px}
    .card{background:#111;border:1px solid #222;border-radius:20px;padding:40px;
          max-width:440px;width:100%;text-align:center}
    .logo{width:64px;height:64px;border-radius:50%;background:#d51007;
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 20px;font-size:32px}
    h1{font-size:22px;margin-bottom:8px}
    p{color:#888;font-size:14px;line-height:1.6;margin-bottom:20px}
    .steps{text-align:left;margin-bottom:24px;padding:16px;background:#1a1a1a;
           border-radius:10px;font-size:13px;color:#aaa;line-height:2}
    .steps b{color:#f0f0f0}
    .row{display:flex;gap:10px;margin-bottom:12px}
    input{flex:1;padding:12px 16px;background:#1a1a1a;border:1px solid #333;
          border-radius:10px;color:#fff;font-size:14px;outline:none}
    input:focus{border-color:#d51007}
    button{width:100%;padding:13px;background:#d51007;border:none;border-radius:10px;
           color:#fff;font-size:15px;font-weight:700;cursor:pointer}
    button:hover{background:#f01208}
    button:disabled{opacity:0.6;cursor:not-allowed}
    #msg{font-size:13px;margin-top:14px;min-height:18px}
    .note{font-size:11px;color:#555;margin-top:14px}
    a{color:#d51007}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🎵</div>
    <h1>Link Last.fm to Roblox</h1>
    <div class="steps">
      <b>How to set up (one time):</b><br>
      1. Create a free account at <a href="https://www.last.fm" target="_blank">last.fm</a><br>
      2. Connect Spotify in Last.fm settings → <b>Applications</b><br>
      3. Enter your details below and click Link
    </div>
    <div class="row">
      <input id="roblox"  placeholder="Roblox username" />
      <input id="lastfm"  placeholder="Last.fm username" />
    </div>
    <button id="btn" onclick="link()">Link Account</button>
    <div id="msg"></div>
    <p class="note">We only store your Last.fm username — no passwords, no private data.</p>
  </div>
  <script>
    async function link() {
      const roblox = document.getElementById('roblox').value.trim();
      const lastfm = document.getElementById('lastfm').value.trim();
      const btn    = document.getElementById('btn');
      const msg    = document.getElementById('msg');
      msg.style.color = '#888'; msg.textContent = '';
      if (!roblox || !lastfm) { showMsg('Fill in both fields.', '#e8385a'); return; }
      btn.disabled = true; btn.textContent = 'Checking...';
      try {
        const res  = await fetch('/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ robloxUsername: roblox, lastfmUsername: lastfm })
        });
        const data = await res.json();
        if (data.ok) {
          showMsg('✓ Linked! Open Roblox and start playing music on Spotify.', '#1DB954');
          btn.textContent = 'Linked ✓';
        } else {
          showMsg(data.error || 'Something went wrong.', '#e8385a');
          btn.disabled = false; btn.textContent = 'Link Account';
        }
      } catch(e) {
        showMsg('Network error. Try again.', '#e8385a');
        btn.disabled = false; btn.textContent = 'Link Account';
      }
    }
    function showMsg(text, color) {
      const m = document.getElementById('msg');
      m.style.color = color; m.textContent = text;
    }
  </script>
</body>
</html>`);
});

// ─── LINK BY ID (called from inside Roblox game) ─────────────────────────────
// POST /api/linkbyid  { robloxUserId, lastfmUsername }
// Roblox already knows the user ID so no username lookup needed.
app.post("/api/linkbyid", async (req, res) => {
  const { robloxUserId, lastfmUsername } = req.body;
  if (!robloxUserId || !lastfmUsername)
    return res.json({ ok: false, error: "Missing fields." });

  // Verify Last.fm user exists
  try {
    const data = await lfmGet({ method: "user.getinfo", user: lastfmUsername.trim() });
    if (data.error || !data.user)
      return res.json({ ok: false, error: "Last.fm username not found. Check spelling." });
  } catch {
    return res.json({ ok: false, error: "Could not reach Last.fm. Try again." });
  }

  saveLink(robloxUserId, lastfmUsername.trim());
  console.log(`In-game link: Roblox ${robloxUserId} → Last.fm ${lastfmUsername}`);
  res.json({ ok: true });
});

// ─── LINK ENDPOINT (web page form) ────────────────────────────────────────────
// POST /link  { robloxUsername, lastfmUsername }
// Validates both accounts exist then saves the link
app.post("/link", async (req, res) => {
  const { robloxUsername, lastfmUsername } = req.body;
  if (!robloxUsername || !lastfmUsername)
    return res.json({ ok: false, error: "Missing fields." });

  // 1. Look up Roblox user ID
  let robloxId;
  try {
    const r = await axios.post(
      "https://users.roblox.com/v1/usernames/users",
      { usernames: [robloxUsername], excludeBannedUsers: true },
      { headers: { "Content-Type": "application/json" } }
    );
    const users = r.data.data;
    if (!users || users.length === 0)
      return res.json({ ok: false, error: "Roblox username not found. Check spelling." });
    robloxId = users[0].id;
  } catch {
    return res.json({ ok: false, error: "Could not reach Roblox. Try again." });
  }

  // 2. Verify Last.fm user exists
  try {
    const data = await lfmGet({ method: "user.getinfo", user: lastfmUsername });
    if (data.error || !data.user)
      return res.json({ ok: false, error: "Last.fm username not found. Check spelling." });
  } catch {
    return res.json({ ok: false, error: "Could not reach Last.fm. Try again." });
  }

  // 3. Save link
  saveLink(robloxId, lastfmUsername);
  console.log(`Linked Roblox ${robloxUsername} (${robloxId}) → Last.fm ${lastfmUsername}`);
  res.json({ ok: true });
});

// ─── API: NOW PLAYING ─────────────────────────────────────────────────────────
// GET /api/nowplaying?userId=ROBLOX_ID
app.get("/api/nowplaying", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const lfmUser = getLastfmUsername(userId);
  if (!lfmUser) return res.json({ linked: false });

  try {
    const data = await lfmGet({
      method:    "user.getrecenttracks",
      user:      lfmUser,
      limit:     1,
      extended:  0,
    });

    if (data.error) return res.json({ linked: false });

    const tracks = data.recenttracks?.track;
    if (!tracks || tracks.length === 0) return res.json({ linked: true, playing: false });

    const track   = Array.isArray(tracks) ? tracks[0] : tracks;
    const playing = track["@attr"]?.nowplaying === "true";

    if (!playing) return res.json({ linked: true, playing: false });

    const trackName  = track.name || "";
    const artistName = track.artist?.["#text"] || track.artist || "";
    const albumName  = track.album?.["#text"]  || track.album  || "";

    // Fetch duration, niche level, and genre from track.getInfo
    let durationMs = 0;
    let nichePct   = 0;
    let genre      = "";
    try {
      const info = await lfmGet({
        method:      "track.getInfo",
        track:       trackName,
        artist:      artistName,
        autocorrect: 1,
      });

      // Duration
      const rawDuration = info?.track?.duration;
      if (rawDuration && rawDuration !== "0") {
        durationMs = parseInt(rawDuration, 10);
      }

      // Niche level from global listener count
      const listeners = parseInt(info?.track?.listeners || "0", 10);
      if (listeners > 0) {
        const l = Math.log10(listeners);
        nichePct = Math.max(0, Math.min(100, Math.round((7 - l) / 4 * 100)));
      } else {
        nichePct = 100;
      }

      // Genre extraction — only accept tags that LOOK like genres.
      // Last.fm tags are user-generated, so they include random stuff (artist names,
      // moods, "favourite", years, etc). We use an allow-list of known genre keywords.
      const GENRE_KEYWORDS = [
        // broad
        "pop", "rock", "rap", "hip hop", "hip-hop", "hiphop",
        "electronic", "edm", "dance", "house", "techno", "trance", "drum and bass", "dnb",
        "jazz", "blues", "classical", "country", "folk", "metal", "punk", "reggae",
        "r&b", "rnb", "soul", "funk", "disco", "indie", "alternative", "experimental",
        "ambient", "acoustic", "instrumental", "k-pop", "kpop", "j-pop", "jpop",
        "latin", "reggaeton", "afrobeat", "afrobeats", "ska", "gospel", "world",
        // subgenres
        "synthwave", "vaporwave", "shoegaze", "dream pop", "lo-fi", "lofi",
        "trap", "drill", "phonk", "grime", "garage", "dubstep", "breakbeat",
        "hardcore", "hardstyle", "house music", "deep house", "tech house", "future bass",
        "psychedelic", "post-rock", "post-punk", "math rock", "emo",
        "screamo", "metalcore", "deathcore", "death metal", "black metal", "thrash",
        "doom metal", "stoner", "grunge", "britpop", "new wave", "synth-pop", "synthpop",
        "bedroom pop", "indie pop", "indie rock", "indie folk", "art pop", "noise pop",
        "alt rock", "alternative rock", "classic rock", "hard rock", "soft rock", "prog rock",
        "progressive rock", "psychedelic rock", "garage rock", "surf rock",
        "boom bap", "conscious hip hop", "alternative hip hop", "underground hip hop",
        "cloud rap", "mumble rap", "old school hip hop", "g-funk", "gangsta rap",
        "neo soul", "alternative r&b", "contemporary r&b",
        "bossa nova", "swing", "bebop", "smooth jazz", "fusion",
        "baroque", "romantic", "opera", "orchestral", "minimalism",
        "bluegrass", "americana", "alt-country",
        "bachata", "salsa", "merengue", "cumbia",
        "future garage", "uk garage", "footwork", "jersey club",
        "post-hardcore", "pop punk", "ska punk", "emo rap",
      ];

      const looksLikeGenre = (name) => {
        const n = name.toLowerCase().trim();
        if (!n || n.length > 30) return false;
        if (/^\d{4}s?$/.test(n)) return false;  // years
        // Exact match in keyword list
        for (const g of GENRE_KEYWORDS) {
          if (n === g) return true;
        }
        // Compound genre detection — must contain a genre keyword as a word
        for (const g of GENRE_KEYWORDS) {
          const regex = new RegExp("\\b" + g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
          if (regex.test(n)) return true;
        }
        return false;
      };

      const trackTags = info?.track?.toptags?.tag;
      const tags = Array.isArray(trackTags) ? trackTags : (trackTags ? [trackTags] : []);
      for (const t of tags) {
        const name = (t.name || "").trim();
        if (looksLikeGenre(name)) { genre = name.toLowerCase(); break; }
      }

      // Fall back to artist tags
      if (!genre) {
        try {
          const artistInfo = await lfmGet({
            method:      "artist.getInfo",
            artist:      artistName,
            autocorrect: 1,
          });
          const aTagsRaw = artistInfo?.artist?.tags?.tag;
          const aTags = Array.isArray(aTagsRaw) ? aTagsRaw : (aTagsRaw ? [aTagsRaw] : []);
          for (const t of aTags) {
            const name = (t.name || "").trim();
            if (looksLikeGenre(name)) { genre = name.toLowerCase(); break; }
          }
        } catch (e) { /* ignore */ }
      }
    } catch (e) {
      // info lookup failed entirely
    }

    // Last.fm doesn't expose playback position and our scrobble-based estimate
    // was unreliable (couldn't distinguish skip from natural end). Start from 0.
    const progressMs = 0;

    res.json({
      linked:     true,
      playing:    true,
      trackName,
      artistName,
      albumName,
      progressMs,
      durationMs,
      nichePct,
      genre,
    });
  } catch (err) {
    console.error("Last.fm nowplaying error:", err.message);
    res.status(500).json({ error: "Last.fm API error" });
  }
});

// ─── API: PROFILE (top track + top artist) ────────────────────────────────────
// GET /api/profile?userId=ROBLOX_ID
app.get("/api/profile", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const lfmUser = getLastfmUsername(userId);
  if (!lfmUser) return res.json({ linked: false });

  try {
    const [tracksData, artistsData] = await Promise.all([
      lfmGet({ method: "user.gettoptracks", user: lfmUser, period: "overall", limit: 1 }),
      lfmGet({ method: "user.gettopartists", user: lfmUser, period: "overall", limit: 1 }),
    ]);

    const topTrack  = tracksData.toptracks?.track?.[0];
    const topArtist = artistsData.topartists?.artist?.[0];

    res.json({
      linked:    true,
      topTrack:  topTrack  ? { name: topTrack.name,  artist: topTrack.artist?.name || "" } : null,
      topArtist: topArtist ? { name: topArtist.name } : null,
    });
  } catch (err) {
    console.error("Last.fm profile error:", err.message);
    res.status(500).json({ error: "Last.fm API error" });
  }
});

// ─── API: LINKED CHECK ────────────────────────────────────────────────────────
// GET /api/linked?userId=ROBLOX_ID
app.get("/api/linked", (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  res.json({ linked: !!getLastfmUsername(userId) });
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
// ── Lyrics endpoint ──────────────────────────────────────────────────────────
// Uses lyrics.ovh — free, no API key needed
// Called by Roblox studio client via HttpService (server-side)
app.get("/api/lyrics", async (req, res) => {
  const { artist, track } = req.query;
  if (!artist || !track) return res.json({ found: false, lyrics: "" });

  const headers = { "User-Agent": "TheRooftop-RobloxGame/1.0 (https://roblox.com)" };

  console.log(`[lyrics] Looking up: ${artist} — ${track}`);

  const clean = raw => raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith("["))
    .slice(0, 24)
    .join("\n");

  // Try search with various query strategies
  const tryUrls = [
    // Strategy 1: search with track + artist as separate params
    "https://lrclib.net/api/search?track_name=" + encodeURIComponent(track) + "&artist_name=" + encodeURIComponent(artist),
    // Strategy 2: search with combined q parameter
    "https://lrclib.net/api/search?q=" + encodeURIComponent(track + " " + artist),
    // Strategy 3: search by track name only (artist might have weird chars)
    "https://lrclib.net/api/search?track_name=" + encodeURIComponent(track),
  ];

  for (const url of tryUrls) {
    try {
      console.log(`[lyrics] Trying: ${url}`);
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000), headers });
      if (!resp.ok) {
        console.log(`[lyrics] HTTP ${resp.status} for ${url}`);
        continue;
      }
      const results = await resp.json().catch(() => null);
      if (!Array.isArray(results)) continue;
      console.log(`[lyrics] Got ${results.length} results`);
      // Find first result with plain lyrics; prefer one matching artist
      let best = null;
      for (const r of results) {
        if (r.plainLyrics && r.plainLyrics.trim() !== "" && !r.instrumental) {
          if (!best) best = r;
          if (r.artistName && r.artistName.toLowerCase().includes(artist.toLowerCase().split(" ")[0])) {
            best = r;
            break;
          }
        }
      }
      if (best && best.plainLyrics) {
        console.log(`[lyrics] Matched: ${best.artistName} — ${best.trackName}`);
        const lines = clean(best.plainLyrics);
        if (lines) return res.json({ found: true, lyrics: lines });
      }
    } catch (e) {
      console.error(`[lyrics] Error on ${url}: ${e.message}`);
    }
  }

  console.log(`[lyrics] Not found for: ${artist} — ${track}`);
  res.json({ found: false, lyrics: "" });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
