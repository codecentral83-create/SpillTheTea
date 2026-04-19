require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const Database = require("better-sqlite3");
const jwt = require("jsonwebtoken");
const OpenAI = require("openai");

const app = express();
const PORT = 4000;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-env";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const Database = require("better-sqlite3");

let db;

try {
  db = new Database("./chat-app.db");
  console.log("Connected to SQLite database.");
} catch (err) {
  console.error("Database connection error:", err.message);
}

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      status TEXT DEFAULT 'soft girl era',
      theme TEXT DEFAULT 'soft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      sender TEXT NOT NULL CHECK(sender IN ('user', 'bot')),
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function getToneInstructions(tone) {
  if (tone === "soft") {
    return `
You are Mia, a kind and emotionally supportive teen girl.

Style:
- Very gentle, caring, validating
- Encouraging and understanding
- Avoid harsh wording
- Comfort the user

Speak like a close friend who really cares.
`;
  }

  if (tone === "blunt") {
    return `
You are Mia, a direct and honest teen girl.

Style:
- Be real and straightforward
- Do NOT sugarcoat
- Still respectful, but say the truth clearly
- Call out bad ideas if needed

Speak like a friend who tells it how it is.
`;
  }

  return `
You are Mia, a balanced and natural teen girl.

Style:
- Friendly and real
- Supportive but honest
- Not overly soft, not harsh

Speak casually like a normal friend.
`;
}

function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Missing token." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

/* SIGN UP */
app.post("/api/login", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const displayName = String(req.body.displayName || "").trim() || "You";

    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    // check if user exists
    let user = await getQuery(
      `SELECT * FROM users WHERE username = ?`,
      [username]
    );

    // if not, create them automatically
    if (!user) {
      const result = await runQuery(
        `INSERT INTO users (username, display_name)
         VALUES (?, ?)`,
        [username, displayName]
      );

      user = await getQuery(
        `SELECT * FROM users WHERE id = ?`,
        [result.lastID]
      );
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        status: user.status,
        theme: user.theme
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login failed." });
  }
});

/* LOGIN */
app.post("/api/login", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const displayName = String(req.body.displayName || "").trim() || "You";
    const status = String(req.body.status || "").trim() || "soft girl era";
    const theme = String(req.body.theme || "").trim() || "soft";

    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    let user = await getQuery(
      `SELECT * FROM users WHERE username = ?`,
      [username]
    );

    if (!user) {
      const result = await runQuery(
        `INSERT INTO users (username, display_name, status, theme)
         VALUES (?, ?, ?, ?)`,
        [username, displayName, status, theme]
      );

      user = await getQuery(
        `SELECT * FROM users WHERE id = ?`,
        [result.lastID]
      );
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        status: user.status,
        theme: user.theme
      }
    });
  } catch (error) {
    console.error("Login failed:", error);
    res.status(500).json({ error: "Login failed." });
  }
});

/* CURRENT USER PROFILE */
app.get("/api/me", authMiddleware, async (req, res) => {
  try {
    const user = await getQuery(
      `
      SELECT id, username, display_name, status, theme
      FROM users
      WHERE id = ?
      `,
      [req.user.userId]
    );

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        status: user.status,
        theme: user.theme
      }
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return res.status(500).json({ error: "Could not load profile." });
  }
});

/* UPDATE PROFILE */
app.put("/api/me", authMiddleware, async (req, res) => {
  try {
    const displayName = String(req.body.displayName || "").trim() || "You";
    const status = String(req.body.status || "").trim() || "soft girl era";
    const theme = String(req.body.theme || "").trim() || "soft";

    await runQuery(
      `
      UPDATE users
      SET display_name = ?, status = ?, theme = ?
      WHERE id = ?
      `,
      [displayName, status, theme, req.user.userId]
    );

    const updated = await getQuery(
      `
      SELECT id, username, display_name, status, theme
      FROM users
      WHERE id = ?
      `,
      [req.user.userId]
    );

    return res.json({
      user: {
        id: updated.id,
        username: updated.username,
        displayName: updated.display_name,
        status: updated.status,
        theme: updated.theme
      }
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return res.status(500).json({ error: "Could not update profile." });
  }
});

/* GET CHAT HISTORY */
app.get("/api/messages", authMiddleware, async (req, res) => {
  try {
    const messages = await allQuery(
      `
      SELECT id, sender, text, created_at
      FROM messages
      WHERE user_id = ?
      ORDER BY id ASC
      `,
      [req.user.userId]
    );

    return res.json({ messages });
  } catch (error) {
    console.error("Messages fetch error:", error);
    return res.status(500).json({ error: "Could not load messages." });
  }
});

/* CLEAR CHAT HISTORY */
app.delete("/api/messages", authMiddleware, async (req, res) => {
  try {
    await runQuery(
      "DELETE FROM messages WHERE user_id = ?",
      [req.user.userId]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("Messages delete error:", error);
    return res.status(500).json({ error: "Could not clear messages." });
  }
});

/* CHAT */
app.post("/api/chat", authMiddleware, async (req, res) => {
  try {
    const userMessage = String(req.body.message || "").trim();
    const tone = String(req.body.tone || "balanced");

    if (!userMessage) {
      return res.status(400).json({ error: "Message is required." });
    }

    await runQuery(
      `
      INSERT INTO messages (user_id, sender, text)
      VALUES (?, 'user', ?)
      `,
      [req.user.userId, userMessage]
    );

    let replyText = "Something went wrong talking to the AI.";

    try {
      const response = await client.responses.create({
        model: "gpt-4.1-mini",
        instructions: getToneInstructions(tone),
        input: userMessage
      });

      replyText = response.output_text || "I don't know what to say yet.";
    } catch (aiError) {
      console.error("OpenAI error:", aiError);

      if (aiError.code === "insufficient_quota") {
        replyText = "My AI connection is set up, but the account is out of quota right now.";
      }
    }

    await runQuery(
      `
      INSERT INTO messages (user_id, sender, text)
      VALUES (?, 'bot', ?)
      `,
      [req.user.userId, replyText]
    );

    return res.json({ reply: replyText });
  } catch (error) {
    console.error("Chat route error:", error);
    return res.status(500).json({ error: "Could not process chat message." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});