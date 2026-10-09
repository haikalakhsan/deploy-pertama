const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });
if(process.env.CLOUDINARY_API_KEY) {
    cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
}

const pool = mysql.createPool(process.env.DATABASE_URL);

// Middleware Auth
const authenticateJWT = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(403).json({ error: "Silakan login terlebih dahulu" });
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Sesi tidak valid" });
        req.user = user;
        next();
    });
};

const verifyAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Akses ditolak. Khusus Admin." });
    next();
};

// --- AUTHENTICATION ---
app.post('/api/register', async (req, res) => {
    try {
        const { name, nim, email, password, lat, lng } = req.body;
        if (!email.endsWith('@students.unnes.ac.id')) return res.status(400).json({ error: "Gagal! Harus menggunakan email @students.unnes.ac.id" });
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (name, nim, email, password, lat, lng) VALUES (?, ?, ?, ?, ?, ?)', [name, nim, email, hashedPassword, lat || -7.05, lng || 110.393]);
        res.status(201).json({ message: "Akun mahasiswa UNNES berhasil dibuat!" });
    } catch (err) { 
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "NIM atau Email sudah terdaftar." });
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE nim = ?', [req.body.nim]);
        if (users.length === 0) return res.status(401).json({ error: "NIM belum terdaftar." });
        if (!(await bcrypt.compare(req.body.password, users[0].password))) return res.status(401).json({ error: "Kata sandi salah." });
        
        const token = jwt.sign({ id: users[0].id, nim: users[0].nim, role: users[0].role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.cookie('token', token, { httpOnly: true, secure: false, sameSite: 'Strict', maxAge: 86400000 });
        const userWithoutPassword = { ...users[0] }; delete userWithoutPassword.password;
        res.json({ message: "Login Success", user: userWithoutPassword });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/logout', (req, res) => { res.clearCookie('token'); res.json({ message: "Logged out" }); });
app.get('/api/me', authenticateJWT, async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, name, nim, email, role, faculty, phone, profile_image FROM users WHERE id = ?', [req.user.id]);
        res.json(users[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/reset-password', async (req, res) => {
    const { nim, email, newPassword } = req.body;
    try {
        const [users] = await pool.query('SELECT id FROM users WHERE nim = ? AND email = ?', [nim, email]);
        if (users.length === 0) return res.status(404).json({ error: "Data tidak valid. NIM dan Email tidak cocok." });
        const hashed = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, users[0].id]);
        res.json({ message: "Kata sandi berhasil direset!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- PRODUCTS ---
app.get('/api/products', async (req, res) => {
    const { search, category, limit = 20, offset = 0 } = req.query;
    try {
        let query = 'SELECT p.*, u.name as seller_name FROM products p JOIN users u ON p.user_id = u.id';
        let params = [];
        let conditions = ['p.is_sold = FALSE'];

        if (search) { conditions.push('(p.name LIKE ? OR p.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
        if (category) { conditions.push('p.category = ?'); params.push(category); }
        
        if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/products', authenticateJWT, upload.single('image'), async (req, res) => {
    // ... (Kode upload Cloudinary/fs bawaan tetap sama)
    const { name, category, description, price, is_barter, condition_grade } = req.body;
    let imageUrl = null;
    try {
        if (req.file) {
            const processedBuffer = await sharp(req.file.buffer).resize({ width: 800 }).webp({ quality: 80 }).toBuffer();
            if (process.env.CLOUDINARY_API_KEY) {
                const streamUpload = (buffer) => new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream({ folder: 'rev_unnes', format: 'webp' }, (err, result) => result ? resolve(result) : reject(err));
                    require('stream').Readable.from(buffer).pipe(stream);
                });
                imageUrl = (await streamUpload(processedBuffer)).secure_url;
            } else {
                const filename = Date.now() + '.webp';
                fs.writeFileSync(path.join(__dirname, 'public', 'uploads', filename), processedBuffer);
                imageUrl = `/uploads/${filename}`;
            }
        }
        await pool.query('INSERT INTO products (user_id, name, category, description, price, image, is_barter_allowed, condition_grade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
        [req.user.id, name, category, description, price, imageUrl, is_barter, condition_grade]);
        res.status(201).json({ message: 'Barang berhasil ditambahkan' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/products/:id/sold', authenticateJWT, async (req, res) => {
    try {
        await pool.query('UPDATE products SET is_sold = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        res.json({ message: "Ditandai terjual!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/products/:id', authenticateJWT, async (req, res) => {
    try {
        const [products] = await pool.query('SELECT image FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (products.length === 0) return res.status(403).json({ error: "Akses ditolak" });
        await pool.query('DELETE FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        const imageUrl = products[0].image;
        if (imageUrl && imageUrl.includes('cloudinary.com') && process.env.CLOUDINARY_API_KEY) {
            const parts = imageUrl.split('/');
            await cloudinary.uploader.destroy(`${parts[parts.length-2]}/${parts[parts.length-1].split('.')[0]}`);
        }
        res.json({ message: 'Terhapus bersih' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- TRANSACTIONS & CHAT HTTP POLLING ---
app.post('/api/transactions', authenticateJWT, async (req, res) => {
    try {
        await pool.query('INSERT INTO transactions (buyer_id, seller_id, product_id) VALUES (?, ?, ?)', [req.user.id, req.body.seller_id, req.body.product_id]);
        res.status(201).json({ message: "Permintaan transaksi dikirim!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/transactions/incoming', authenticateJWT, async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT t.*, p.name as product_name, p.image as product_image, u.name as buyer_name 
            FROM transactions t JOIN products p ON t.product_id = p.id JOIN users u ON t.buyer_id = u.id 
            WHERE (t.seller_id = ? AND t.status = 'pending') OR (t.buyer_id = ? AND t.status = 'accepted') ORDER BY t.created_at DESC`, [req.user.id, req.user.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/transactions/:id/status', authenticateJWT, async (req, res) => {
    try {
        await pool.query('UPDATE transactions SET status = ? WHERE id = ? AND seller_id = ?', [req.body.status, req.params.id, req.user.id]);
        res.json({ message: `Status diperbarui` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/transactions/:id/complete', authenticateJWT, async (req, res) => {
    try {
        await pool.query('UPDATE transactions SET status = "completed", rating = ?, review = ? WHERE id = ? AND buyer_id = ?', 
            [req.body.rating, req.body.review, req.params.id, req.user.id]);
        res.json({ message: "Selesai!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/messages', authenticateJWT, async (req, res) => {
    try {
        await pool.query('INSERT INTO messages (room, sender_id, sender_name, message) VALUES (?, ?, ?, ?)', 
            [req.body.room, req.user.id, req.body.sender_name, req.body.message]);
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/messages/:room', authenticateJWT, async (req, res) => {
    try {
        const [msgs] = await pool.query('SELECT * FROM messages WHERE room = ? ORDER BY created_at ASC', [req.params.room]);
        res.json(msgs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/chat/:partnerId/transaction', authenticateJWT, async (req, res) => {
    try {
        const [txs] = await pool.query(`SELECT t.status, p.name FROM transactions t JOIN products p ON t.product_id = p.id 
            WHERE (t.buyer_id = ? AND t.seller_id = ?) OR (t.buyer_id = ? AND t.seller_id = ?) ORDER BY t.created_at DESC LIMIT 1`, 
            [req.user.id, req.params.partnerId, req.params.partnerId, req.user.id]);
        res.json(txs.length > 0 ? txs[0] : null);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/store/:userId', async (req, res) => {
    try {
        const [user] = await pool.query('SELECT name, faculty, profile_image, created_at FROM users WHERE id = ?', [req.params.userId]);
        const [products] = await pool.query('SELECT * FROM products WHERE user_id = ? ORDER BY is_sold ASC, created_at DESC', [req.params.userId]);
        res.json({ user: user[0], products });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 RE:V Server berjalan di port ${PORT}`));