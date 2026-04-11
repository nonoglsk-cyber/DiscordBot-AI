import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("database.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT
  );

  CREATE TABLE IF NOT EXISTS bots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    description TEXT,
    language TEXT,
    code TEXT,
    status TEXT DEFAULT 'offline',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Discord OAuth API
  app.get("/api/auth/discord/url", (req, res) => {
    const client_id = process.env.DISCORD_CLIENT_ID;
    
    // Détermination dynamique de l'URL de base
    const host = req.get('x-forwarded-host') || req.get('host');
    const protocol = req.get('x-forwarded-proto') || 'https';
    let baseUrl = process.env.APP_URL || `${protocol}://${host}`;
    
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    const redirect_uri = `${baseUrl}/api/auth/discord/callback`;
    
    console.log(`[OAuth] Generating auth URL with redirect_uri: ${redirect_uri}`);
    
    if (!client_id) {
      return res.status(500).json({ error: "DISCORD_CLIENT_ID not configured" });
    }

    const params = new URLSearchParams({
      client_id: client_id,
      redirect_uri: redirect_uri,
      response_type: "code",
      scope: "identify email",
    });

    const url = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    res.json({ url });
  });

  app.get(["/api/auth/discord/callback", "/api/auth/discord/callback/"], async (req, res) => {
    const { code } = req.query;
    const client_id = process.env.DISCORD_CLIENT_ID;
    const client_secret = process.env.DISCORD_CLIENT_SECRET;
    
    const host = req.get('x-forwarded-host') || req.get('host');
    const protocol = req.get('x-forwarded-proto') || 'https';
    let baseUrl = process.env.APP_URL || `${protocol}://${host}`;
    
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    const redirect_uri = `${baseUrl}/api/auth/discord/callback`;

    console.log(`[OAuth] Callback received. Using redirect_uri for exchange: ${redirect_uri}`);

    if (!code) {
      return res.status(400).send("No code provided");
    }

    try {
      const tokenResponse = await axios.post(
        "https://discord.com/api/oauth2/token",
        new URLSearchParams({
          client_id: client_id!,
          client_secret: client_secret!,
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: redirect_uri,
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const { access_token } = tokenResponse.data;

      const userResponse = await axios.get("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      const discordUser = userResponse.data;

      res.send(`
        <html>
          <body style="background: #0f172a; color: white; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center;">
            <div style="background: rgba(255,255,255,0.05); padding: 2rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.1);">
              <h2 style="color: #818cf8;">Authentification réussie !</h2>
              <p style="color: rgba(255,255,255,0.6);">Connexion en cours...</p>
              <script>
                const payload = ${JSON.stringify(discordUser)};
                
                // 1. Try postMessage (Fastest)
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', payload }, '*');
                }
                
                // 2. Fallback: LocalStorage (Most reliable)
                localStorage.setItem('discord_auth_result', JSON.stringify({
                  timestamp: Date.now(),
                  payload
                }));

                // Try to close
                setTimeout(() => {
                  window.close();
                }, 1000);
              </script>
              <button onclick="window.close()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #4f46e5; border: none; color: white; border-radius: 0.5rem; cursor: pointer;">Fermer la fenêtre</button>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Discord OAuth error:", error?.response?.data || error.message);
      res.status(500).send("L'authentification a échoué");
    }
  });

  // Simple Auth API (Mock for demo purposes, but functional)
  app.post("/api/auth/signup", (req, res) => {
    const { email, password } = req.body;
    try {
      const info = db.prepare("INSERT INTO users (email, password) VALUES (?, ?)").run(email, password);
      res.json({ success: true, userId: info.lastInsertRowid });
    } catch (e) {
      res.status(400).json({ error: "Email already exists" });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password);
    if (user) {
      res.json({ success: true, user: { id: user.id, email: user.email } });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Bot Management API
  app.get("/api/bots/:userId", (req, res) => {
    const bots = db.prepare("SELECT * FROM bots WHERE user_id = ? ORDER BY created_at DESC").all(req.params.userId);
    res.json(bots);
  });

  app.post("/api/bots", (req, res) => {
    const { userId, name, description, language, code } = req.body;
    const info = db.prepare("INSERT INTO bots (user_id, name, description, language, code) VALUES (?, ?, ?, ?, ?)").run(userId, name, description, language, code);
    res.json({ id: info.lastInsertRowid });
  });

  app.patch("/api/bots/:id", (req, res) => {
    const { code, status } = req.body;
    if (code !== undefined) {
      db.prepare("UPDATE bots SET code = ? WHERE id = ?").run(code, req.params.id);
    }
    if (status !== undefined) {
      db.prepare("UPDATE bots SET status = ? WHERE id = ?").run(status, req.params.id);
    }
    res.json({ success: true });
  });

  app.delete("/api/bots/:id", (req, res) => {
    db.prepare("DELETE FROM bots WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
