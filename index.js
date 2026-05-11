const express = require("express");
const axios   = require("axios");
const fs      = require("fs");
const path    = require("path");

const app = express();
app.use(express.json());

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Get a free API key at: https://www.last.fm/api/account/create
const LASTFM_API_KEY = "d614aa71c5c00c5d56776a1256f7a63c";
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

    // Fetch duration from track.getInfo in parallel — returns ms e.g. "240000"
    let durationMs = 0;
    try {
      const info = await lfmGet({
        method:      "track.getInfo",
        track:       trackName,
        artist:      artistName,
        autocorrect: 1,
      });
      const rawDuration = info?.track?.duration;
      if (rawDuration && rawDuration !== "0") {
        durationMs = parseInt(rawDuration, 10);
      }
    } catch (e) {
      // Duration unavailable — not fatal, client will show elapsed timer only
    }

    res.json({
      linked:     true,
      playing:    true,
      trackName,
      artistName,
      albumName,
      progressMs: 0,      // Last.fm gives no playback position
      durationMs,         // real duration in ms from track.getInfo
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
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
