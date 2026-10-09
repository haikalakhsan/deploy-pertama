const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupDB() {
    try {
        const db = await mysql.createConnection(process.env.DATABASE_URL);
        console.log("✅ Terhubung ke database Aiven.");

        await db.query("DROP TABLE IF EXISTS messages, transactions, products, users");
        
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
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
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
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        console.log("🎉 Semua tabel berhasil direset dan dibuat dengan struktur terbaru!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Gagal setup database:", err);
        process.exit(1);
    }
}
setupDB();