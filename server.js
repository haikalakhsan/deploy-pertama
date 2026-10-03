require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;

if (process.env.CLOUDINARY_API_KEY) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    console.log('[+] Cloudinary Aktif');
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'uniswap_db',
    ssl: process.env.DB_HOST?.includes('aiven') ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true, connectionLimit: 10
});

// SOCKET IO DENGAN DATABASE SAVING
io.on('connection', (socket) => {
    socket.on('joinRoom', (roomName) => { socket.join(roomName); });
    socket.on('sendMessage', async (data) => {
        io.to(data.room).emit('receiveMessage', data);
        try {
            await pool.query('INSERT INTO messages (room, sender_id, sender_name, message) VALUES (?, ?, ?, ?)',
                [data.room, data.userId, data.sender, data.msg]);
        } catch (err) { console.error('Gagal simpan chat:', err); }
    });
});

const authenticateJWT = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Sesi telah habis. Silakan login." });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token tidak valid." });
        req.user = user; next();
    });
};

app.get('/api/me', authenticateJWT, async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, name, nim, email, role, faculty, phone, profile_image FROM users WHERE id = ?', [req.user.id]);
        res.json({ user: users[0] });
    } catch (err) { res.status(500).json({ error: "Server Error" }); }
});

app.post('/api/logout', (req, res) => { res.clearCookie('token'); res.json({ message: "Logout berhasil" }); });

// FITUR PROFIL (DIKEMBALIKAN!)
app.put('/api/users/:id', authenticateJWT, upload.single('profile_image'), async (req, res) => {
    if (req.user.id != req.params.id) return res.status(403).json({ error: "Forbidden" });
    const { faculty, phone } = req.body;
    let profileImageUrl = null;

    if (req.file) {
        try {
            // Kompres foto profil menjadi persegi 400x400
            const processedBuffer = await sharp(req.file.buffer)
                .resize({ width: 400, height: 400, fit: 'cover' })
                .webp({ quality: 80 }).toBuffer();

            if (process.env.CLOUDINARY_API_KEY) {
                const streamUpload = (buffer) => {
                    return new Promise((resolve, reject) => {
                        const stream = cloudinary.uploader.upload_stream({ folder: 'rev_unnes', format: 'webp' }, (error, result) => {
                            if (result) resolve(result); else reject(error);
                        });
                        require('stream').Readable.from(buffer).pipe(stream);
                    });
                };
                const result = await streamUpload(processedBuffer);
                profileImageUrl = result.secure_url;
            } else {
                const filename = 'prof-' + Date.now() + '.webp';
                const dir = path.join(__dirname, 'public', 'uploads');
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, filename), processedBuffer);
                profileImageUrl = `/uploads/${filename}`;
            }
        } catch (err) { return res.status(500).json({ error: "Gagal memproses gambar profil" }); }
    }

    try {
        if (profileImageUrl) {
            await pool.query('UPDATE users SET faculty = ?, phone = ?, profile_image = ? WHERE id = ?', [faculty, phone, profileImageUrl, req.user.id]);
        } else {
            await pool.query('UPDATE users SET faculty = ?, phone = ? WHERE id = ?', [faculty, phone, req.user.id]);
        }
        res.json({ message: 'Profil diperbarui' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products', async (req, res) => {
    // Ambil parameter dari URL untuk pencarian backend asli
    const { search, category, limit = 20, offset = 0 } = req.query;
    try {
        let query = 'SELECT p.*, u.name as seller_name FROM products p JOIN users u ON p.user_id = u.id';
        let params = [];
        let conditions = [];

        // Filter dari query
        if (search) {
            conditions.push('(p.name LIKE ? OR p.description LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }
        if (category) {
            conditions.push('p.category = ?');
            params.push(category);
        }

        conditions.push('p.is_sold = FALSE');

        // Merakit SQL dinamis
        if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');

        // Batasi hanya memuat 20 barang per halaman agar tidak berat (Paginasi)
        query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/products', authenticateJWT, upload.single('image'), async (req, res) => {
    const { name, category, description, price, is_barter, condition_grade } = req.body;
    let imageUrl = null;

    if (req.file) {
        try {
            const processedBuffer = await sharp(req.file.buffer)
                .resize({ width: 800, withoutEnlargement: true })
                .webp({ quality: 80 }).toBuffer();

            if (process.env.CLOUDINARY_API_KEY) {
                const streamUpload = (buffer) => {
                    return new Promise((resolve, reject) => {
                        const stream = cloudinary.uploader.upload_stream({ folder: 'rev_unnes', format: 'webp' }, (error, result) => {
                            if (result) resolve(result); else reject(error);
                        });
                        require('stream').Readable.from(buffer).pipe(stream);
                    });
                };
                const result = await streamUpload(processedBuffer);
                imageUrl = result.secure_url;
            } else {
                const filename = Date.now() + '-' + Math.round(Math.random() * 1E9) + '.webp';
                const dir = path.join(__dirname, 'public', 'uploads');
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, filename), processedBuffer);
                imageUrl = `/uploads/${filename}`;
            }
        } catch (err) { return res.status(500).json({ error: "Gagal memproses gambar" }); }
    }

    try {
        await pool.query('INSERT INTO products (user_id, name, category, description, price, image, is_barter_allowed, condition_grade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, name, category, description, price, imageUrl, is_barter, condition_grade]);
        res.status(201).json({ message: 'Produk ditambahkan' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mengambil daftar pesanan masuk untuk penjual
app.get('/api/transactions/incoming', authenticateJWT, async (req, res) => {
    try {
        const query = `
            SELECT t.*, p.name as product_name, p.image as product_image, u.name as buyer_name 
            FROM transactions t 
            JOIN products p ON t.product_id = p.id 
            JOIN users u ON t.buyer_id = u.id 
            WHERE t.seller_id = ? AND t.status = 'pending'
            ORDER BY t.created_at DESC
        `;
        const [rows] = await pool.query(query, [req.user.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mengubah status transaksi (Terima / Tolak)
app.put('/api/transactions/:id/status', authenticateJWT, async (req, res) => {
    const { status } = req.body;
    try {
        await pool.query('UPDATE transactions SET status = ? WHERE id = ? AND seller_id = ?',
            [status, req.params.id, req.user.id]);
        res.json({ message: `Transaksi ${status}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/match', authenticateJWT, async (req, res) => {
    const { keyword, radius } = req.query;
    try {
        const [me] = await pool.query('SELECT lat, lng FROM users WHERE id = ?', [req.user.id]);
        const myLat = me[0].lat, myLng = me[0].lng;

        const query = `
            SELECT p.*, u.name as seller_name, u.faculty,
            (6371 * acos(cos(radians(?)) * cos(radians(u.lat)) * cos(radians(u.lng) - radians(?)) + sin(radians(?)) * sin(radians(u.lat)))) AS distance
            FROM products p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.user_id != ? AND p.is_barter_allowed = 1 AND (p.name LIKE ? OR p.category LIKE ?)
            HAVING distance <= ? 
            ORDER BY distance ASC LIMIT 10
        `;
        const searchKw = `%${keyword}%`;
        const [matches] = await pool.query(query, [myLat, myLng, myLat, req.user.id, searchKw, searchKw, parseFloat(radius)]);
        res.json(matches);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/messages/:room', authenticateJWT, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM messages WHERE room = ? ORDER BY created_at ASC', [req.params.room]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/transactions', authenticateJWT, async (req, res) => {
    const { seller_id, product_id } = req.body;
    try {
        await pool.query('INSERT INTO transactions (buyer_id, seller_id, product_id) VALUES (?, ?, ?)', [req.user.id, seller_id, product_id]);
        res.status(201).json({ message: "Pengajuan transaksi terkirim" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// FITUR REGISTER DENGAN VALIDASI EMAIL UNNES
app.post('/api/register', async (req, res) => {
    try {
        const { name, nim, email, password, lat, lng } = req.body;

        // Cek domain email
        if (!email.endsWith('@students.unnes.ac.id')) {
            return res.status(400).json({ error: "Gagal! Harus menggunakan email @students.unnes.ac.id" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (name, nim, email, password, lat, lng) VALUES (?, ?, ?, ?, ?, ?)',
            [name, nim, email, hashedPassword, lat || -7.0500, lng || 110.3930]);
        res.status(201).json({ message: "Akun mahasiswa UNNES berhasil dibuat!" });
    } catch (err) {
        // Tangkap error jika email/NIM sudah terdaftar
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "NIM atau Email sudah terdaftar." });
        res.status(500).json({ error: err.message });
    }
});

// FITUR LUPA KATA SANDI
app.post('/api/reset-password', async (req, res) => {
    const { nim, email, newPassword } = req.body;
    try {
        const [users] = await pool.query('SELECT id FROM users WHERE nim = ? AND email = ?', [nim, email]);
        if (users.length === 0) return res.status(404).json({ error: "Data tidak valid. NIM dan Email tidak cocok." });

        const hashed = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, users[0].id]);
        res.json({ message: "Kata sandi berhasil direset! Silakan Masuk." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE nim = ?', [req.body.nim]);

        // 1. Cek apakah NIM ada di database
        if (users.length === 0) {
            return res.status(401).json({ error: "NIM belum terdaftar. Silakan 'Daftar' akun baru terlebih dahulu." });
        }

        // 2. Cek kecocokan password
        if (!(await bcrypt.compare(req.body.password, users[0].password))) {
            return res.status(401).json({ error: "Kata sandi yang kamu masukkan salah." });
        }

        // 3. Login sukses, berikan token
        const token = jwt.sign({ id: users[0].id, nim: users[0].nim, role: users[0].role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.cookie('token', token, { httpOnly: true, secure: false, sameSite: 'Strict', maxAge: 86400000 });

        const userWithoutPassword = { ...users[0] };
        delete userWithoutPassword.password;

        res.json({ message: "Login Success", user: userWithoutPassword });
    } catch (err) {
        res.status(500).json({ error: "Terjadi kesalahan server saat login." });
    }
});

// FITUR UPDATE BARANG (EDIT)
app.put('/api/products/:id', authenticateJWT, upload.single('image'), async (req, res) => {
    const { name, category, description, price, is_barter, condition_grade } = req.body;
    let imageUrl = null;

    try {
        // Cek apakah barang ini benar milik user yang sedang login
        const [existing] = await pool.query('SELECT image FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (existing.length === 0) return res.status(403).json({ error: "Akses ditolak" });

        // Jika user mengunggah gambar baru
        if (req.file) {
            const processedBuffer = await sharp(req.file.buffer).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
            if (process.env.CLOUDINARY_API_KEY) {
                const streamUpload = (buffer) => new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream({ folder: 'rev_unnes', format: 'webp' }, (err, result) => result ? resolve(result) : reject(err));
                    require('stream').Readable.from(buffer).pipe(stream);
                });
                const result = await streamUpload(processedBuffer);
                imageUrl = result.secure_url;
            } else {
                const filename = Date.now() + '-' + Math.round(Math.random() * 1E9) + '.webp';
                fs.writeFileSync(path.join(__dirname, 'public', 'uploads', filename), processedBuffer);
                imageUrl = `/uploads/${filename}`;
            }
        }

        // Update database (dengan atau tanpa gambar baru)
        if (imageUrl) {
            await pool.query('UPDATE products SET name=?, category=?, description=?, price=?, image=?, is_barter_allowed=?, condition_grade=? WHERE id=? AND user_id=?',
                [name, category, description, price, imageUrl, is_barter, condition_grade, req.params.id, req.user.id]);
        } else {
            await pool.query('UPDATE products SET name=?, category=?, description=?, price=?, is_barter_allowed=?, condition_grade=? WHERE id=? AND user_id=?',
                [name, category, description, price, is_barter, condition_grade, req.params.id, req.user.id]);
        }
        res.json({ message: 'Barang berhasil diperbarui' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// FITUR HAPUS BARANG (Sekarang otomatis hapus gambar di Cloudinary juga!)
app.delete('/api/products/:id', authenticateJWT, async (req, res) => {
    try {
        // 1. Ambil URL gambar sebelum datanya dihapus
        const [products] = await pool.query('SELECT image FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (products.length === 0) return res.status(403).json({ error: "Barang tidak ditemukan" });

        const imageUrl = products[0].image;

        // 2. Hapus dari database MySQL
        await pool.query('DELETE FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);

        // 3. Bersihkan foto dari Cloudinary untuk mencegah storage bocor
        if (imageUrl && imageUrl.includes('cloudinary.com') && process.env.CLOUDINARY_API_KEY) {
            const urlParts = imageUrl.split('/');
            const filenameWithExt = urlParts[urlParts.length - 1]; // ex: foto.webp
            const folder = urlParts[urlParts.length - 2]; // ex: rev_unnes
            const publicId = `${folder}/${filenameWithExt.split('.')[0]}`; // Hasil: rev_unnes/foto

            await cloudinary.uploader.destroy(publicId);
        }

        res.json({ message: 'Terhapus bersih' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
// ENDPOINT: PENYELESAIAN COD & RATING
app.put('/api/transactions/:id/complete', authenticateJWT, async (req, res) => {
    const { rating, review } = req.body;
    try {
        await pool.query('UPDATE transactions SET status = "completed", rating = ?, review = ? WHERE id = ? AND buyer_id = ?', 
            [rating, review, req.params.id, req.user.id]);
        res.json({ message: "Transaksi Selesai & Ulasan Tersimpan!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// MIDDLEWARE KHUSUS ADMIN
const verifyAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Akses ditolak. Khusus Admin." });
    next();
};

// ENDPOINT: ADMIN DASHBOARD (Melihat Semua User & Produk)
app.get('/api/admin/dashboard', authenticateJWT, verifyAdmin, async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, name, nim, role, created_at FROM users ORDER BY created_at DESC');
        const [products] = await pool.query('SELECT id, name, category, price FROM products ORDER BY created_at DESC');
        res.json({ users, products });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
// ENDPOINT: TANDAI BARANG TERJUAL
app.put('/api/products/:id/sold', authenticateJWT, async (req, res) => {
    try {
        await pool.query('UPDATE products SET is_sold = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        res.json({ message: "Barang berhasil ditandai sebagai Terjual!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ENDPOINT: ETALASE PUBLIK PENJUAL
app.get('/api/store/:userId', async (req, res) => {
    try {
        const [user] = await pool.query('SELECT name, faculty, profile_image, created_at FROM users WHERE id = ?', [req.params.userId]);
        if (user.length === 0) return res.status(404).json({ error: "Pengguna tidak ditemukan" });
        
        const [products] = await pool.query('SELECT * FROM products WHERE user_id = ? ORDER BY is_sold ASC, created_at DESC', [req.params.userId]);
        res.json({ user: user[0], products });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ENDPOINT: CEK STATUS TRANSAKSI DI CHAT
app.get('/api/chat/:partnerId/transaction', authenticateJWT, async (req, res) => {
    try {
        const [txs] = await pool.query(`
            SELECT t.status, p.name FROM transactions t 
            JOIN products p ON t.product_id = p.id 
            WHERE (t.buyer_id = ? AND t.seller_id = ?) OR (t.buyer_id = ? AND t.seller_id = ?)
            ORDER BY t.created_at DESC LIMIT 1
        `, [req.user.id, req.params.partnerId, req.params.partnerId, req.user.id]);
        res.json(txs.length > 0 ? txs[0] : null);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
server.listen(PORT, () => { console.log(`[+] RE:V Server RUNNING on http://localhost:${PORT}`); });
