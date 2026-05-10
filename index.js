const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Fill these in after creating your Spotify app at developer.spotify.com
const SPOTIFY_CLIENT_ID = "a51eaa6e7a494e46bffab05a36a6e183";
const SPOTIFY_CLIENT_SECRET = "b3a303a1517042859ebe86cca55a7869";

// This must exactly match what you put in your Spotify app's Redirect URIs
// e.g. https://your-railway-app.up.railway.app/callback
const REDIRECT_URI = "https://roblox-spotify-backend-production.up.railway.app/callback";

const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-top-read",
].join(" ");

// ─── SIMPLE FILE-BASED DATABASE ──────────────────────────────────────────────
// Stores { robloxUserId: { accessToken, refreshToken, expiresAt } }
const DB_PATH = path.join(__dirname, "db.json");

function readDB() {
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, "{}");
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function saveUser(robloxUserId, tokens) {
  const db = readDB();
  db[String(robloxUserId)] = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  writeDB(db);
}

function getUser(robloxUserId) {
  const db = readDB();
  return db[String(robloxUserId)] || null;
}

// ─── TOKEN REFRESH ────────────────────────────────────────────────────────────
async function refreshAccessToken(robloxUserId) {
  const user = getUser(robloxUserId);
  if (!user) return null;

  try {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: user.refreshToken,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const db = readDB();
    db[String(robloxUserId)].accessToken = response.data.access_token;
    db[String(robloxUserId)].expiresAt =
      Date.now() + response.data.expires_in * 1000;
    if (response.data.refresh_token) {
      db[String(robloxUserId)].refreshToken = response.data.refresh_token;
    }
    writeDB(db);
    return response.data.access_token;
  } catch (err) {
    console.error("Token refresh failed:", err.response?.data || err.message);
    return null;
  }
}

async function getValidToken(robloxUserId) {
  const user = getUser(robloxUserId);
  if (!user) return null;
  if (Date.now() < user.expiresAt - 30000) return user.accessToken;
  return await refreshAccessToken(robloxUserId);
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Home page - players visit this to link their Spotify
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Link Spotify to Roblox</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: #0a0a0a;
          color: #f0f0f0;
          font-family: 'Segoe UI', sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          gap: 24px;
          padding: 20px;
        }
        .card {
          background: #111;
          border: 1px solid #222;
          border-radius: 20px;
          padding: 40px;
          max-width: 420px;
          width: 100%;
          text-align: center;
        }
        .logo {
          width: 64px; height: 64px; border-radius: 50%;
          background: #1DB954;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 20px;
          font-size: 32px;
        }
        h1 { font-size: 22px; margin-bottom: 8px; }
        p { color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
        input {
          width: 100%;
          padding: 12px 16px;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 10px;
          color: #fff;
          font-size: 14px;
          margin-bottom: 12px;
          outline: none;
        }
        input:focus { border-color: #1DB954; }
        button {
          width: 100%;
          padding: 13px;
          background: #1DB954;
          border: none;
          border-radius: 10px;
          color: #000;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
        }
        button:hover { background: #22d460; }
        .note { font-size: 12px; color: #555; margin-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">🎵</div>
        <h1>Link Spotify to Roblox</h1>
        <p>Enter your Roblox username to connect your Spotify account and show friends what you're listening to.</p>
        <input type="text" id="username" placeholder="Your Roblox username" />
        <button onclick="link()">Connect Spotify</button>
        <p class="note">Your username is used to link your Spotify to your Roblox account. We don't store passwords.</p>
      </div>
      <script>
        async function link() {
          const username = document.getElementById('username').value.trim();
          if (!username) return alert('Enter your Roblox username');
          try {
            // Look up their Roblox user ID from username
            const res = await fetch('https://api.roblox.com/users/get-by-username?username=' + encodeURIComponent(username));
            const data = await res.json();
            if (!data.Id) return alert('Roblox username not found. Check spelling.');
            window.location.href = '/auth?robloxUserId=' + data.Id;
          } catch(e) {
            alert('Could not reach Roblox API. Try again.');
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Step 1: Redirect user to Spotify login
app.get("/auth", (req, res) => {
  const { robloxUserId } = req.query;
  if (!robloxUserId) return res.status(400).send("Missing robloxUserId");

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state: String(robloxUserId), // we pass the roblox ID through state
  });

  res.redirect("https://accounts.spotify.com/authorize?" + params.toString());
});

// Step 2: Spotify sends user back here with a code
app.get("/callback", async (req, res) => {
  const { code, state: robloxUserId, error } = req.query;

  if (error) return res.send("Spotify login was cancelled.");
  if (!code || !robloxUserId) return res.status(400).send("Bad callback");

  try {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    saveUser(robloxUserId, response.data);

    res.send(`
      <!DOCTYPE html>
      <html><head><title>Linked!</title>
      <style>
        body { background:#0a0a0a; color:#f0f0f0; font-family:'Segoe UI',sans-serif;
               display:flex; align-items:center; justify-content:center; min-height:100vh; }
        .card { background:#111; border:1px solid #222; border-radius:20px; padding:40px;
                text-align:center; max-width:360px; }
        h1 { color:#1DB954; margin-bottom:12px; }
        p { color:#888; font-size:14px; }
      </style></head>
      <body><div class="card">
        <h1>✓ Spotify Linked!</h1>
        <p>You're all set! Join any game and your music will show up for others to see.</p>
      </div></body></html>
    `);
  } catch (err) {
    console.error("Token exchange failed:", err.response?.data || err.message);
    res.status(500).send("Failed to link Spotify. Please try again.");
  }
});

// ─── API ENDPOINTS (called by Roblox) ────────────────────────────────────────

// GET /api/nowplaying?userId=123456
// Returns the player's currently playing track
app.get("/api/nowplaying", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const token = await getValidToken(userId);
  if (!token) return res.json({ linked: false });

  try {
    const response = await axios.get(
      "https://api.spotify.com/v1/me/player/currently-playing",
      { headers: { Authorization: "Bearer " + token } }
    );

    if (response.status === 204 || !response.data || !response.data.item) {
      return res.json({ linked: true, playing: false });
    }

    const track = response.data.item;
    res.json({
      linked: true,
      playing: true,
      trackName: track.name,
      artistName: track.artists.map((a) => a.name).join(", "),
      albumName: track.album.name,
      progressMs: response.data.progress_ms,
      durationMs: track.duration_ms,
    });
  } catch (err) {
    if (err.response?.status === 401) {
      return res.json({ linked: false });
    }
    res.status(500).json({ error: "Spotify API error" });
  }
});

// GET /api/profile?userId=123456
// Returns top track + top artist for the profile card
app.get("/api/profile", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const token = await getValidToken(userId);
  if (!token) return res.json({ linked: false });

  try {
    const [topTracksRes, topArtistsRes] = await Promise.all([
      axios.get(
        "https://api.spotify.com/v1/me/top/tracks?limit=1&time_range=long_term",
        { headers: { Authorization: "Bearer " + token } }
      ),
      axios.get(
        "https://api.spotify.com/v1/me/top/artists?limit=1&time_range=long_term",
        { headers: { Authorization: "Bearer " + token } }
      ),
    ]);

    const topTrack = topTracksRes.data.items[0];
    const topArtist = topArtistsRes.data.items[0];

    res.json({
      linked: true,
      topTrack: topTrack
        ? { name: topTrack.name, artist: topTrack.artists[0].name }
        : null,
      topArtist: topArtist ? { name: topArtist.name } : null,
    });
  } catch (err) {
    res.status(500).json({ error: "Spotify API error" });
  }
});

// GET /api/linked?userId=123456
// Quick check: has this user linked Spotify?
app.get("/api/linked", (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  const user = getUser(userId);
  res.json({ linked: !!user });
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
