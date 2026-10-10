require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET belum diisi di environment variable.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diisi di environment variable.');

const IS_VERCEL = !!process.env.VERCEL;
const IS_PROD = process.env.NODE_ENV === 'production' || IS_VERCEL;
const USE_CLOUDINARY = !!process.env.CLOUDINARY_API_KEY;
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const CATEGORIES = ['Elektronik', 'Buku & Diktat', 'Perabot Kos', 'Fashion', 'Tas & ATK', 'Lainnya'];

if (USE_CLOUDINARY) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
} else if (!IS_VERCEL) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
    decimalNumbers: true, // DECIMAL dikirim sebagai angka, bukan string
    waitForConnections: true,
    connectionLimit: 5
});

// ---------- Helpers ----------
class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function rateLimit({ windowMs, max, message }) {
    const hits = new Map();
    return (req, res, next) => {
        const now = Date.now();
        let e = hits.get(req.ip);
        if (!e || e.reset < now) e = { count: 0, reset: now + windowMs };
        e.count++;
        hits.set(req.ip, e);
        if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
        if (e.count > max) return res.status(429).json({ error: message });
        next();
    };
}
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.' });
const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Terlalu banyak pesan. Pelan-pelan ya.' });

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB (batas body Vercel ~4.5 MB)
    fileFilter: (req, file, cb) =>
        file.mimetype.startsWith('image/') ? cb(null, true) : cb(new HttpError(400, 'File harus berupa gambar.'))
});

async function saveImage(buffer) {
    let processed;
    try {
        processed = await sharp(buffer).rotate().resize({ width: 800, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    } catch {
        throw new HttpError(400, 'File bukan gambar yang valid.');
    }
    if (USE_CLOUDINARY) {
        return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream({ folder: 'rev_unnes', format: 'webp' }, (err, result) =>
                result ? resolve(result.secure_url) : reject(err));
            Readable.from(processed).pipe(stream);
        });
    }
    if (IS_VERCEL) throw new HttpError(500, 'Upload lokal tidak didukung di Vercel. Aktifkan Cloudinary.');
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}.webp`;
    await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), processed);
    return `/uploads/${filename}`;
}

async function removeImage(url) {
    if (!url) return;
    try {
        if (USE_CLOUDINARY && url.includes('res.cloudinary.com')) {
            const m = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
            if (m) await cloudinary.uploader.destroy(m[1]);
        } else if (url.startsWith('/uploads/')) {
            await fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(url)));
        }
    } catch (e) { console.warn('Gagal menghapus gambar lama:', e.message); }
}

function parseProduct(body) {
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim();
    const category = String(body.category || '');
    const price = Number(body.price);
    const condition_grade = String(body.condition_grade || 'B');
    const is_barter_allowed = ['1', 'true'].includes(String(body.is_barter)) ? 1 : 0;
    if (!name || name.length > 255) throw new HttpError(400, 'Nama barang wajib diisi (maks. 255 karakter).');
    if (!CATEGORIES.includes(category)) throw new HttpError(400, 'Kategori tidak valid.');
    if (!Number.isFinite(price) || price <= 0 || price > 99999999) throw new HttpError(400, 'Harga tidak valid.');
    if (!['A', 'B', 'C'].includes(condition_grade)) throw new HttpError(400, 'Grade kondisi tidak valid.');
    if (description.length > 2000) throw new HttpError(400, 'Deskripsi maksimal 2000 karakter.');
    return { name, description, category, price, condition_grade, is_barter_allowed };
}

// ---------- Auth middleware ----------
const authenticateJWT = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Sesi tidak valid, silakan login ulang' });
    }
};

// ---------- AUTH ----------
app.post('/api/register', registerLimiter, asyncH(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const nim = String(req.body.nim || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    let lat = Number(req.body.lat), lng = Number(req.body.lng);

    if (!name || name.length > 100) throw new HttpError(400, 'Nama wajib diisi (maks. 100 karakter).');
    if (!/^\d{8,20}$/.test(nim)) throw new HttpError(400, 'NIM harus berupa angka (8-20 digit).');
    if (!email.endsWith('@students.unnes.ac.id') || email.length > 100) throw new HttpError(400, 'Gagal! Harus menggunakan email @students.unnes.ac.id');
    if (password.length < 8 || password.length > 72) throw new HttpError(400, 'Kata sandi harus 8-72 karakter.');
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) lat = -7.05;
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) lng = 110.393;

    const hashed = await bcrypt.hash(password, 10);
    try {
        await pool.query('INSERT INTO users (name, nim, email, password, lat, lng) VALUES (?, ?, ?, ?, ?, ?)', [name, nim, email, hashed, lat, lng]);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') throw new HttpError(400, 'NIM atau Email sudah terdaftar.');
        throw err;
    }
    res.status(201).json({ message: 'Akun mahasiswa UNNES berhasil dibuat!' });
}));

app.post('/api/login', loginLimiter, asyncH(async (req, res) => {
    const nim = String(req.body.nim || '').trim();
    const password = String(req.body.password || '');
    const [users] = await pool.query('SELECT * FROM users WHERE nim = ?', [nim]);
    if (users.length === 0 || !(await bcrypt.compare(password, users[0].password))) {
        throw new HttpError(401, 'NIM atau kata sandi salah.');
    }
    const u = users[0];
    const token = jwt.sign({ id: u.id, nim: u.nim, role: u.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.cookie('token', token, { httpOnly: true, secure: IS_PROD, sameSite: 'strict', maxAge: 86400000 });
    delete u.password;
    res.json({ message: 'Login Success', user: u });
}));

app.post('/api/logout', (req, res) => {
    res.clearCookie('token', { httpOnly: true, secure: IS_PROD, sameSite: 'strict' });
    res.json({ message: 'Logged out' });
});

app.get('/api/me', authenticateJWT, asyncH(async (req, res) => {
    const [users] = await pool.query('SELECT id, name, nim, email, role, faculty, phone, profile_image FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) return res.status(401).json({ error: 'Akun tidak ditemukan' });
    res.json(users[0]);
}));

// PERINGATAN: alur reset ini masih lemah (hanya NIM + email). Ganti dengan OTP/link yang dikirim ke email UNNES.
app.post('/api/reset-password', loginLimiter, asyncH(async (req, res) => {
    const nim = String(req.body.nim || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 8 || newPassword.length > 72) throw new HttpError(400, 'Kata sandi harus 8-72 karakter.');
    const [users] = await pool.query('SELECT id FROM users WHERE nim = ? AND email = ?', [nim, email]);
    if (users.length === 0) throw new HttpError(404, 'Data tidak valid. NIM dan Email tidak cocok.');
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, users[0].id]);
    res.json({ message: 'Kata sandi berhasil direset!' });
}));

// ---------- PROFILE ----------
app.put('/api/profile', authenticateJWT, upload.single('image'), asyncH(async (req, res) => {
    const fields = [], params = [];
    if (req.body.faculty !== undefined) {
        const faculty = String(req.body.faculty).trim();
        if (faculty.length > 50) throw new HttpError(400, 'Fakultas maksimal 50 karakter.');
        fields.push('faculty = ?'); params.push(faculty || null);
    }
    if (req.body.phone !== undefined) {
        const phone = String(req.body.phone).trim();
        if (phone.length > 20 || !/^[0-9+\-\s]*$/.test(phone)) throw new HttpError(400, 'Nomor WhatsApp tidak valid.');
        fields.push('phone = ?'); params.push(phone || null);
    }
    let oldImage = null;
    if (req.file) {
        const [[cur]] = await pool.query('SELECT profile_image FROM users WHERE id = ?', [req.user.id]);
        oldImage = cur && cur.profile_image;
        fields.push('profile_image = ?'); params.push(await saveImage(req.file.buffer));
    }
    if (fields.length === 0) throw new HttpError(400, 'Tidak ada data yang diubah.');
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...params, req.user.id]);
    if (oldImage) await removeImage(oldImage);
    const [[user]] = await pool.query('SELECT id, name, nim, email, role, faculty, phone, profile_image FROM users WHERE id = ?', [req.user.id]);
    res.json(user);
}));

// ---------- PRODUCTS ----------
app.get('/api/products', asyncH(async (req, res) => {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const category = String(req.query.category || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const conditions = ['p.is_sold = FALSE'];
    const params = [];
    if (search) { conditions.push('(p.name LIKE ? OR p.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (category) { conditions.push('p.category = ?'); params.push(category); }
    params.push(limit, offset);

    const [rows] = await pool.query(
        `SELECT p.*, u.name AS seller_name FROM products p JOIN users u ON p.user_id = u.id
         WHERE ${conditions.join(' AND ')} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, params);
    res.json(rows);
}));

app.get('/api/my-products', authenticateJWT, asyncH(async (req, res) => {
    const [rows] = await pool.query(
        `SELECT p.*, u.name AS seller_name FROM products p JOIN users u ON p.user_id = u.id
         WHERE p.user_id = ? ORDER BY p.is_sold ASC, p.created_at DESC`, [req.user.id]);
    res.json(rows);
}));

app.post('/api/products', authenticateJWT, upload.single('image'), asyncH(async (req, res) => {
    const p = parseProduct(req.body);
    if (!req.file) throw new HttpError(400, 'Foto barang wajib diunggah.');
    const imageUrl = await saveImage(req.file.buffer);
    await pool.query(
        'INSERT INTO products (user_id, name, category, description, price, image, is_barter_allowed, condition_grade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [req.user.id, p.name, p.category, p.description, p.price, imageUrl, p.is_barter_allowed, p.condition_grade]);
    res.status(201).json({ message: 'Barang berhasil ditambahkan' });
}));

app.put('/api/products/:id', authenticateJWT, upload.single('image'), asyncH(async (req, res) => {
    const [rows] = await pool.query('SELECT image FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (rows.length === 0) throw new HttpError(404, 'Barang tidak ditemukan atau bukan milikmu.');
    const p = parseProduct(req.body);
    let image = rows[0].image;
    if (req.file) image = await saveImage(req.file.buffer);
    await pool.query(
        'UPDATE products SET name=?, category=?, description=?, price=?, image=?, is_barter_allowed=?, condition_grade=? WHERE id=? AND user_id=?',
        [p.name, p.category, p.description, p.price, image, p.is_barter_allowed, p.condition_grade, req.params.id, req.user.id]);
    if (req.file) await removeImage(rows[0].image);
    res.json({ message: 'Barang diperbarui' });
}));

app.put('/api/products/:id/sold', authenticateJWT, asyncH(async (req, res) => {
    const [r] = await pool.query('UPDATE products SET is_sold = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!r.affectedRows) throw new HttpError(404, 'Barang tidak ditemukan atau bukan milikmu.');
    await pool.query("UPDATE transactions SET status = 'cancelled' WHERE product_id = ? AND status IN ('pending','accepted')", [req.params.id]);
    res.json({ message: 'Ditandai terjual!' });
}));

app.delete('/api/products/:id', authenticateJWT, asyncH(async (req, res) => {
    const [rows] = await pool.query('SELECT image FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (rows.length === 0) throw new HttpError(403, 'Akses ditolak');
    await pool.query('DELETE FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    await removeImage(rows[0].image);
    res.json({ message: 'Terhapus bersih' });
}));

// Pencarian barang barter milik orang lain
app.get('/api/barter', authenticateJWT, asyncH(async (req, res) => {
    const keyword = String(req.query.keyword || '').trim().slice(0, 100);
    if (!keyword) throw new HttpError(400, 'Isi kata kunci barang yang kamu cari.');
    const [rows] = await pool.query(
        `SELECT p.*, u.name AS seller_name FROM products p JOIN users u ON p.user_id = u.id
         WHERE p.is_sold = FALSE AND p.is_barter_allowed = TRUE AND p.user_id <> ?
           AND (p.name LIKE ? OR p.description LIKE ? OR p.category LIKE ?)
         ORDER BY p.created_at DESC LIMIT 20`,
        [req.user.id, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`]);
    res.json(rows);
}));

// ---------- TRANSACTIONS ----------
app.post('/api/transactions', authenticateJWT, asyncH(async (req, res) => {
    const productId = parseInt(req.body.product_id);
    if (!productId) throw new HttpError(400, 'Barang tidak valid.');
    const [products] = await pool.query('SELECT id, user_id, is_sold FROM products WHERE id = ?', [productId]);
    const product = products[0];
    if (!product) throw new HttpError(404, 'Barang tidak ditemukan.');
    if (product.is_sold) throw new HttpError(400, 'Barang sudah terjual.');
    if (product.user_id === req.user.id) throw new HttpError(400, 'Tidak bisa membeli barang sendiri.');
    const [dup] = await pool.query("SELECT id FROM transactions WHERE buyer_id = ? AND product_id = ? AND status IN ('pending','accepted')", [req.user.id, productId]);
    if (dup.length > 0) throw new HttpError(409, 'Kamu sudah mengajukan transaksi untuk barang ini.');
    await pool.query('INSERT INTO transactions (buyer_id, seller_id, product_id) VALUES (?, ?, ?)', [req.user.id, product.user_id, productId]);
    res.status(201).json({ message: 'Permintaan transaksi dikirim!' });
}));

app.get('/api/transactions/incoming', authenticateJWT, asyncH(async (req, res) => {
    const [rows] = await pool.query(
        `SELECT t.id, t.status, t.buyer_id, t.seller_id, t.product_id, t.created_at,
                p.name AS product_name, p.image AS product_image, b.name AS buyer_name, s.name AS seller_name
         FROM transactions t
         JOIN products p ON t.product_id = p.id
         JOIN users b ON t.buyer_id = b.id
         JOIN users s ON t.seller_id = s.id
         WHERE (t.seller_id = ? OR t.buyer_id = ?) AND t.status IN ('pending','accepted')
         ORDER BY t.created_at DESC LIMIT 50`, [req.user.id, req.user.id]);
    res.json(rows);
}));

app.put('/api/transactions/:id/status', authenticateJWT, asyncH(async (req, res) => {
    const status = req.body.status;
    if (!['accepted', 'cancelled'].includes(status)) throw new HttpError(400, 'Status tidak valid.');
    const [r] = await pool.query("UPDATE transactions SET status = ? WHERE id = ? AND seller_id = ? AND status = 'pending'", [status, req.params.id, req.user.id]);
    if (!r.affectedRows) throw new HttpError(409, 'Transaksi tidak ditemukan atau sudah diproses.');
    res.json({ message: 'Status diperbarui' });
}));

app.put('/api/transactions/:id/complete', authenticateJWT, asyncH(async (req, res) => {
    const rating = parseInt(req.body.rating);
    const review = String(req.body.review || '').trim().slice(0, 500);
    if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Rating harus 1-5.');

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [txs] = await conn.query("SELECT id, product_id FROM transactions WHERE id = ? AND buyer_id = ? AND status = 'accepted' FOR UPDATE", [req.params.id, req.user.id]);
        if (txs.length === 0) throw new HttpError(409, 'Transaksi belum diterima penjual atau sudah selesai.');
        const tx = txs[0];
        await conn.query("UPDATE transactions SET status = 'completed', rating = ?, review = ? WHERE id = ?", [rating, review, tx.id]);
        await conn.query('UPDATE products SET is_sold = TRUE WHERE id = ?', [tx.product_id]);
        await conn.query("UPDATE transactions SET status = 'cancelled' WHERE product_id = ? AND id <> ? AND status IN ('pending','accepted')", [tx.product_id, tx.id]);
        await conn.commit();
        res.json({ message: 'Selesai!' });
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}));

// ---------- CHAT (HTTP polling) ----------
function assertRoomAccess(room, userId) {
    if (room === 'global') return;
    const m = /^room_(\d+)_(\d+)$/.exec(room);
    if (!m || (Number(m[1]) !== userId && Number(m[2]) !== userId)) throw new HttpError(403, 'Kamu tidak punya akses ke ruang chat ini.');
}

app.post('/api/messages', authenticateJWT, chatLimiter, asyncH(async (req, res) => {
    const room = String(req.body.room || '');
    const message = String(req.body.message || '').trim();
    assertRoomAccess(room, req.user.id);
    if (!message || message.length > 1000) throw new HttpError(400, 'Pesan harus 1-1000 karakter.');
    const [[user]] = await pool.query('SELECT name FROM users WHERE id = ?', [req.user.id]);
    if (!user) throw new HttpError(401, 'Akun tidak ditemukan.');
    await pool.query('INSERT INTO messages (room, sender_id, sender_name, message) VALUES (?, ?, ?, ?)', [room, req.user.id, user.name, message]);
    res.status(201).json({ success: true });
}));

app.get('/api/messages/:room', authenticateJWT, asyncH(async (req, res) => {
    assertRoomAccess(req.params.room, req.user.id);
    const after = parseInt(req.query.after) || 0;
    let rows;
    if (after > 0) {
        [rows] = await pool.query('SELECT id, sender_id, sender_name, message, created_at FROM messages WHERE room = ? AND id > ? ORDER BY id ASC LIMIT 200', [req.params.room, after]);
    } else {
        [rows] = await pool.query('SELECT id, sender_id, sender_name, message, created_at FROM messages WHERE room = ? ORDER BY id DESC LIMIT 100', [req.params.room]);
        rows.reverse();
    }
    res.json(rows);
}));

app.get('/api/chat/:partnerId/transaction', authenticateJWT, asyncH(async (req, res) => {
    const partnerId = parseInt(req.params.partnerId);
    if (!partnerId) return res.json(null);
    const [txs] = await pool.query(
        `SELECT t.status, p.name FROM transactions t JOIN products p ON t.product_id = p.id
         WHERE (t.buyer_id = ? AND t.seller_id = ?) OR (t.buyer_id = ? AND t.seller_id = ?)
         ORDER BY t.created_at DESC LIMIT 1`, [req.user.id, partnerId, partnerId, req.user.id]);
    res.json(txs.length > 0 ? txs[0] : null);
}));

// ---------- PUBLIC STORE ----------
app.get('/api/store/:userId', asyncH(async (req, res) => {
    const [users] = await pool.query('SELECT name, faculty, profile_image, created_at FROM users WHERE id = ?', [req.params.userId]);
    if (users.length === 0) throw new HttpError(404, 'Penjual tidak ditemukan.');
    const [products] = await pool.query(
        `SELECT p.*, u.name AS seller_name FROM products p JOIN users u ON p.user_id = u.id
         WHERE p.user_id = ? ORDER BY p.is_sold ASC, p.created_at DESC`, [req.params.userId]);
    res.json({ user: users[0], products });
}));

// ---------- Fallback & error ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Ukuran foto maksimal 4 MB.' });
    if (err instanceof multer.MulterError) return res.status(400).json({ error: 'Upload gagal: ' + err.message });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Format data tidak valid.' });
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 RE:V Server berjalan di port ${PORT}`));
}