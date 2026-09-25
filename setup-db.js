require('dotenv').config();
const mysql = require('mysql2/promise');

async function setupDatabase() {
    console.log("⏳ Menyambungkan ke Aiven...");
    
    try {
        const db = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            ssl: { rejectUnauthorized: false } 
        });
        console.log("✅ Terhubung ke Aiven Cloud!");

        console.log("⏳ Menanam tabel 'users'...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                nim VARCHAR(20) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                faculty VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("⏳ Menanam tabel 'products'...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                name VARCHAR(150) NOT NULL,
                price DECIMAL(10, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        console.log("🎉 SUKSES BESAR! Struktur database kamu sudah siap di Aiven.");
        db.end();
        
    } catch (error) {
        console.error("❌ GAGAL. Pastikan file .env sudah diisi dengan benar. Pesan Error:", error.message);
    }
}

setupDatabase();
