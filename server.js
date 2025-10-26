import express from "express";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { nanoid } from "nanoid";

const app = express();
app.use(express.json());

// Initialize database
const adapter = new JSONFile("db.json");
const db = new Low(adapter, { urls: [] });

const EXPIRATION_HOURS = 3;

// Utility: remove expired URLs
function cleanExpiredURLs() {
  const now = new Date();
  const beforeCount = db.data.urls.length;

  db.data.urls = db.data.urls.filter((url) => {
    const added = new Date(url.addedAt);
    const diffHours = (now - added) / (1000 * 60 * 60);
    return diffHours < EXPIRATION_HOURS;
  });

  if (db.data.urls.length !== beforeCount) {
    db.write();
    console.log("🧹 Removed expired URLs");
  }
}

// Initialize database and start cleanup
async function initializeApp() {
  await db.read();
  db.data ||= { urls: [] };
  await db.write(); // Ensure file exists

  // Cleanup every 5 minutes
  setInterval(cleanExpiredURLs, 5 * 60 * 1000);
  cleanExpiredURLs();

  console.log("Database initialized");
}

initializeApp();

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "URL Shortener API",
    endpoints: {
      "GET /urls": "Get all URLs",
      "POST /urls": "Create a new short URL",
      "DELETE /urls/:id": "Delete a URL by ID",
      "GET /:id": "Redirect to original URL",
    },
  });
});

// GET all URLs
app.get("/urls", async (req, res) => {
  await db.read();
  res.json(db.data.urls);
});

// POST a new URL
app.post("/urls", async (req, res) => {
  const { link } = req.body;
  if (!link) return res.status(400).json({ error: "Missing link" });

  // Basic URL validation
  try {
    new URL(link);
  } catch (err) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  const newUrl = {
    id: nanoid(8), // Shorter ID for URLs
    link,
    addedAt: new Date().toISOString(),
  };

  await db.read();
  db.data.urls.push(newUrl);
  await db.write();

  res.status(201).json(newUrl);
});

// Redirect to original URL
app.get("/:id", async (req, res) => {
  const { id } = req.params;

  await db.read();
  const url = db.data.urls.find((item) => item.id === id);

  if (!url) {
    return res.status(404).json({ error: "URL not found" });
  }

  res.redirect(url.link);
});

// DELETE URL by ID
app.delete("/urls/:id", async (req, res) => {
  const { id } = req.params;

  await db.read();
  const initialLength = db.data.urls.length;
  db.data.urls = db.data.urls.filter((url) => url.id !== id);

  if (db.data.urls.length === initialLength) {
    return res.status(404).json({ error: "URL not found" });
  }

  await db.write();
  res.status(204).send();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
