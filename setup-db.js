require('dotenv').config();
const mysql = require('mysql2/promise');

async function setupDatabase() {
    console.log("⏳ Menyambungkan ke Aiven Cloud...");
    try {
        const db = await mysql.createConnection({
            host: process.env.DB_HOST, port: process.env.DB_PORT,
            user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME, ssl: { rejectUnauthorized: false }
        });
        console.log("✅ Terhubung!");

        console.log("🧹 Membersihkan tabel lama (Drop Tables)...");
        await db.query(`DROP TABLE IF EXISTS transactions;`);
        await db.query(`DROP TABLE IF EXISTS messages;`);
        await db.query(`DROP TABLE IF EXISTS products;`);
        await db.query(`DROP TABLE IF EXISTS users;`);

        console.log("🔨 Membuat tabel 'users'...");
        await db.query(`
            CREATE TABLE users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                nim VARCHAR(20) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                faculty VARCHAR(50),
                phone VARCHAR(20),
                profile_image VARCHAR(255),
                lat DECIMAL(10, 8) DEFAULT -7.05000000, 
                lng DECIMAL(11, 8) DEFAULT 110.39300000,
                is_verified BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("🔨 Membuat tabel 'products'...");
        await db.query(`
            CREATE TABLE products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                name VARCHAR(150) NOT NULL,
                category VARCHAR(50),
                description TEXT,
                price DECIMAL(10, 2),
                image VARCHAR(255),
                is_barter_allowed BOOLEAN DEFAULT TRUE,
                condition_grade ENUM('A', 'B', 'C') NOT NULL,
                cod_points VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        console.log("🔨 Membuat tabel 'messages' (Chat History)...");
        await db.query(`
            CREATE TABLE messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room VARCHAR(50) NOT NULL,
                sender_id INT NOT NULL,
                sender_name VARCHAR(100) NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        console.log("🔨 Membuat tabel 'transactions' (Barter/Jual-Beli)...");
        await db.query(`
            CREATE TABLE transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                buyer_id INT NOT NULL,
                seller_id INT NOT NULL,
                product_id INT NOT NULL,
                status ENUM('pending', 'accepted', 'completed', 'cancelled') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            );
        `);

        console.log("🎉 Database komplit (TANPA DATA DUMMY)! Jalankan: npm start");
        db.end();
    } catch (error) { console.error("❌ GAGAL:", error.message); }
}
setupDatabase();
