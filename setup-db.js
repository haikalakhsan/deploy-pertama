const mysql = require('mysql2/promise');
const readline = require('readline');
require('dotenv').config();

function confirmReset() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('⚠️  Ini akan MENGHAPUS semua tabel & data (users, products, transactions, messages).\nKetik RESET untuk melanjutkan: ', (answer) => {
            rl.close();
            resolve(answer.trim() === 'RESET');
        });
    });
}

async function setupDB() {
    try {
        if (!(await confirmReset())) {
            console.log('Dibatalkan. Tidak ada yang diubah.');
            process.exit(0);
        }

        const db = await mysql.createConnection({
            uri: process.env.DATABASE_URL,
            ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false }
        });
        console.log('✅ Terhubung ke database.');

        await db.query('DROP TABLE IF EXISTS messages, transactions, products, users');

        console.log("🔨 Membuat tabel 'users'...");
        await db.query(`
            CREATE TABLE users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                nim VARCHAR(20) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('student', 'admin') DEFAULT 'student',
                faculty VARCHAR(50),
                phone VARCHAR(20),
                profile_image VARCHAR(255),
                lat DECIMAL(10, 8) DEFAULT -7.05000000,
                lng DECIMAL(11, 8) DEFAULT 110.39300000,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("🔨 Membuat tabel 'products'...");
        await db.query(`
            CREATE TABLE products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(100),
                description TEXT,
                price DECIMAL(10, 2) NOT NULL,
                image VARCHAR(255),
                is_barter_allowed BOOLEAN DEFAULT FALSE,
                condition_grade ENUM('A', 'B', 'C') DEFAULT 'B',
                is_sold BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_products_sold_created (is_sold, created_at),
                INDEX idx_products_user (user_id)
            );
        `);

        console.log("🔨 Membuat tabel 'transactions'...");
        await db.query(`
            CREATE TABLE transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                buyer_id INT NOT NULL,
                seller_id INT NOT NULL,
                product_id INT NOT NULL,
                status ENUM('pending', 'accepted', 'completed', 'cancelled') DEFAULT 'pending',
                rating INT DEFAULT NULL,
                review TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                INDEX idx_tx_seller (seller_id, status),
                INDEX idx_tx_buyer (buyer_id, status)
            );
        `);

        console.log("🔨 Membuat tabel 'messages'...");
        await db.query(`
            CREATE TABLE messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room VARCHAR(100) NOT NULL,
                sender_id INT NOT NULL,
                sender_name VARCHAR(100) NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_messages_room_id (room, id)
            );
        `);

        console.log('🎉 Semua tabel berhasil direset dan dibuat dengan struktur terbaru!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Gagal setup database:', err);
        process.exit(1);
    }
}
setupDB();