const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, "books.db");

let db;

const initDB = async () => {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    await db.run(`
        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            price REAL NOT NULL
        )
    `);
    const count = await db.get("SELECT COUNT(*) AS cnt FROM books");
    if (count.cnt === 0) {
        await db.run(`INSERT INTO books (title, author, price) VALUES
            ('The Pragmatic Programmer', 'Andrew Hunt', 42.99),
            ('Clean Code', 'Robert C. Martin', 35.50),
            ('You Don''t Know JS', 'Kyle Simpson', 29.99),
            ('Eloquent JavaScript', 'Marijn Haverbeke', 25.00),
            ('Node.js Design Patterns', 'Mario Casciaro', 49.99)
        `);
    }
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
};

// ─── GET /books ──────────────────────────────────────────────────────────────
// Query params: search_q, order_by, order, limit, offset, min_price, max_price
app.get("/books", async (req, res) => {
    const {
        search_q = "",
        order_by = "id",
        order = "ASC",
        limit = 10,
        offset = 0,
        min_price,
        max_price,
    } = req.query;

    const allowedOrderBy = ["id", "title", "author", "price"];
    const allowedOrder = ["ASC", "DESC"];

    if (!allowedOrderBy.includes(order_by)) {
        return res.status(400).json({ message: `Invalid order_by value. Allowed: ${allowedOrderBy.join(", ")}` });
    }
    if (!allowedOrder.includes(order.toUpperCase())) {
        return res.status(400).json({ message: "Invalid order value. Allowed: ASC, DESC" });
    }

    let query = "SELECT * FROM books WHERE title LIKE ?";
    const params = [`%${search_q}%`];

    if (min_price !== undefined && max_price !== undefined) {
        query += " AND price BETWEEN ? AND ?";
        params.push(parseFloat(min_price), parseFloat(max_price));
    } else if (min_price !== undefined) {
        query += " AND price >= ?";
        params.push(parseFloat(min_price));
    } else if (max_price !== undefined) {
        query += " AND price <= ?";
        params.push(parseFloat(max_price));
    }

    query += ` ORDER BY ${order_by} ${order.toUpperCase()} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const books = await db.all(query, params);
    res.status(200).json(books);
});

// ─── GET /books/:id ──────────────────────────────────────────────────────────
app.get("/books/:id", async (req, res) => {
    const { id } = req.params;
    if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID. ID must be a number." });
    }
    const book = await db.get("SELECT * FROM books WHERE id = ?", [id]);
    if (!book) {
        return res.status(404).json({ message: `Book with id ${id} not found.` });
    }
    res.status(200).json(book);
});

// ─── POST /books ─────────────────────────────────────────────────────────────
app.post("/books", async (req, res) => {
    const { title, author, price } = req.body;

    if (!title || !author || price === undefined) {
        return res.status(400).json({ message: "Missing required fields: title, author, and price are required." });
    }
    if (typeof title !== "string" || title.trim() === "") {
        return res.status(400).json({ message: "Invalid title. Title must be a non-empty string." });
    }
    if (typeof author !== "string" || author.trim() === "") {
        return res.status(400).json({ message: "Invalid author. Author must be a non-empty string." });
    }
    if (isNaN(parseFloat(price)) || !isFinite(price)) {
        return res.status(400).json({ message: "Invalid price. Price must be a numeric value." });
    }

    const result = await db.run(
        "INSERT INTO books (title, author, price) VALUES (?, ?, ?)",
        [title.trim(), author.trim(), parseFloat(price)]
    );
    res.status(201).json({ message: "Book created successfully.", id: result.lastID });
});

// ─── PUT /books/:id ──────────────────────────────────────────────────────────
app.put("/books/:id", async (req, res) => {
    const { id } = req.params;
    if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID. ID must be a number." });
    }

    const existing = await db.get("SELECT * FROM books WHERE id = ?", [id]);
    if (!existing) {
        return res.status(404).json({ message: `Book with id ${id} not found.` });
    }

    const { title, author, price } = req.body;

    if (price !== undefined && (isNaN(parseFloat(price)) || !isFinite(price))) {
        return res.status(400).json({ message: "Invalid price. Price must be a numeric value." });
    }

    const updatedTitle  = title  !== undefined ? title.trim()   : existing.title;
    const updatedAuthor = author !== undefined ? author.trim()  : existing.author;
    const updatedPrice  = price  !== undefined ? parseFloat(price) : existing.price;

    await db.run(
        "UPDATE books SET title = ?, author = ?, price = ? WHERE id = ?",
        [updatedTitle, updatedAuthor, updatedPrice, id]
    );
    res.status(200).json({ message: "Book updated successfully." });
});

// ─── DELETE /books/:id ───────────────────────────────────────────────────────
app.delete("/books/:id", async (req, res) => {
    const { id } = req.params;
    if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID. ID must be a number." });
    }

    const existing = await db.get("SELECT * FROM books WHERE id = ?", [id]);
    if (!existing) {
        return res.status(404).json({ message: `Book with id ${id} not found.` });
    }

    await db.run("DELETE FROM books WHERE id = ?", [id]);
    res.status(200).json({ message: "Book deleted successfully." });
});

initDB().catch((err) => {
    console.error("Failed to initialise database:", err.message);
    process.exit(1);
});

module.exports = app;
