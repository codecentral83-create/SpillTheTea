require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const Database = require("better-sqlite3");
const jwt = require("jsonwebtoken");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-env";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Database
let db;

try {
  db = new Database(path.join(__dirname, "chat-app.db"));
  console.log("Connected to SQLite database.");
} catch (err) {
  console.error("Database connection error:", err.message);
  process.exit(1);
}

// Create tables
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      status TEXT DEFAULT 'soft girl era',
      theme TEXT DEFAULT 'soft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      sender TEXT NOT NULL CHECK(sender IN ('user', 'bot')),
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  console.log("Database tables ready.");
} catch (err) {
  console.error("Database setup error:", err.message);
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Helpers
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
      username: user.username,
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

// Prepared statements
const getUserByUsernameStmt = db.prepare(`
  SELECT * FROM users WHERE username = ?
`);

const getUserByIdStmt = db.prepare(`
  SELECT id, username, display_name, status, theme
  FROM users
  WHERE id = ?
`);

const insertUserStmt = db.prepare(`
  INSERT INTO users (username, display_name, status, theme)
  VALUES (?, ?, ?, ?)
`);

const updateUserStmt = db.prepare(`
  UPDATE users
  SET display_name = ?, status = ?, theme = ?
  WHERE id = ?
`);

const getMessagesStmt = db.prepare(`
  SELECT id, sender, text, created_at
  FROM messages
  WHERE user_id = ?
  ORDER BY id ASC
`);

const insertMessageStmt = db.prepare(`
  INSERT INTO messages (user_id, sender, text)
  VALUES (?, ?, ?)
`);

const deleteMessagesStmt = db.prepare(`
  DELETE FROM messages
  WHERE user_id = ?
`);

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

// Login / auto-create user
app.post("/api/login", (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const displayName = String(req.body.displayName || "").trim() || "You";
    const status = String(req.body.status || "").trim() || "soft girl era";
    const theme = String(req.body.theme || "").trim() || "soft";

    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    let user = getUserByUsernameStmt.get(username);

    if (!user) {
      const result = insertUserStmt.run(username, displayName, status, theme);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    }

    const token = generateToken(user);

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        status: user.status,
        theme: user.theme,
      },
    });
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(500).json({ error: "Login failed." });
  }
});

// Current user profile
app.get("/api/me", authMiddleware, (req, res) => {
  try {
    const user = getUserByIdStmt.get(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        status: user.status,
        theme: user.theme,
      },
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return res.status(500).json({ error: "Could not load profile." });
  }
});

// Update profile
app.put("/api/me", authMiddleware, (req, res) => {
  try {
    const displayName = String(req.body.displayName || "").trim() || "You";
    const status = String(req.body.status || "").trim() || "soft girl era";
    const theme = String(req.body.theme || "").trim() || "soft";

    updateUserStmt.run(displayName, status, theme, req.user.userId);

    const updated = getUserByIdStmt.get(req.user.userId);

    return res.json({
      user: {
        id: updated.id,
        username: updated.username,
        displayName: updated.display_name,
        status: updated.status,
        theme: updated.theme,
      },
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return res.status(500).json({ error: "Could not update profile." });
  }
});

// Get chat history
app.get("/api/messages", authMiddleware, (req, res) => {
  try {
    const messages = getMessagesStmt.all(req.user.userId);
    return res.json({ messages });
  } catch (error) {
    console.error("Messages fetch error:", error);
    return res.status(500).json({ error: "Could not load messages." });
  }
});

// Clear chat history
app.delete("/api/messages", authMiddleware, (req, res) => {
  try {
    deleteMessagesStmt.run(req.user.userId);
    return res.json({ success: true });
  } catch (error) {
    console.error("Messages delete error:", error);
    return res.status(500).json({ error: "Could not clear messages." });
  }
});

// Chat
app.post("/api/chat", authMiddleware, async (req, res) => {
  try {
    const userMessage = String(req.body.message || "").trim();
    const tone = String(req.body.tone || "balanced").trim().toLowerCase();

    if (!userMessage) {
      return res.status(400).json({ error: "Message is required." });
    }

    insertMessageStmt.run(req.user.userId, "user", userMessage);

    let replyText = "Something went wrong talking to the AI.";

    try {
      const response = await client.responses.create({
        model: "gpt-4.1-mini",
        instructions: getToneInstructions(tone),
        input: userMessage,
      });

      replyText = response.output_text || "I don't know what to say yet.";
    } catch (aiError) {
      console.error("OpenAI error:", aiError);

      if (aiError.code === "insufficient_quota") {
        replyText = "My AI connection is set up, but the account is out of quota right now.";
      }
    }

    insertMessageStmt.run(req.user.userId, "bot", replyText);

    return res.json({ reply: replyText });
  } catch (error) {
    console.error("Chat route error:", error);
    return res.status(500).json({ error: "Could not process chat message." });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});