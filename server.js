const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// Konfigurasi Bot Telegram
const TELEGRAM_BOT_TOKEN = "8049596093:AAE6H3J5TUBE_Bry1puo9XtK__NmwA--LPk";
const TELEGRAM_USER_ID = "7341190291"; 

const absensiFile = path.join(__dirname, "absensi.json");

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    next();
});

// Health check endpoint
app.get("/api/health", (req, res) => {
    res.status(200).json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        server: "running"
    });
});

// Tampilkan halaman form
app.get("/", (req, res) => {
    try {
        res.sendFile(path.join(__dirname, "index.html"));
    } catch (error) {
        console.error("Error serving index.html:", error);
        res.status(500).send("Server Error");
    }
});

// Test koneksi Telegram
async function testTelegramConnection() {
    try {
        const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`, {
            timeout: 5000
        });
        console.log("✅ Telegram Bot connected:", response.data.result.username);
        return true;
    } catch (error) {
        console.error("❌ Telegram Bot connection failed:", error.message);
        return false;
    }
}

// Kirim pesan ke Telegram
async function sendTelegramMessage(text, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.post(
                `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, 
                {
                    chat_id: TELEGRAM_USER_ID,
                    text: text,
                    parse_mode: 'HTML'
                },
                {
                    timeout: 10000
                }
            );
            
            if (response.data.ok) {
                console.log("✅ Message sent to Telegram successfully");
                return true;
            }
        } catch (error) {
            console.error(`❌ Attempt ${i + 1} failed to send Telegram message:`, error.message);
            if (i === retries - 1) {
                throw error;
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
    return false;
}

// Simpan data absensi ke file
function saveAbsensiToFile(data) {
    try {
        let absensiList = [];
        
        // Baca data existing jika file ada
        if (fs.existsSync(absensiFile)) {
            const fileContent = fs.readFileSync(absensiFile, 'utf8');
            if (fileContent.trim()) {
                absensiList = JSON.parse(fileContent);
            }
        }
        
        // Tambah data baru
        absensiList.push({
            ...data,
            id: Date.now(),
            timestamp: new Date().toISOString()
        });
        
        // Simpan kembali ke file
        fs.writeFileSync(absensiFile, JSON.stringify(absensiList, null, 2));
        console.log("✅ Data saved to file successfully");
        return true;
    } catch (error) {
        console.error("❌ Error saving to file:", error);
        return false;
    }
}

// Handle absen
app.post("/api/absen", async (req, res) => {
    try {
        const { nama, umur, kelas, waktu } = req.body;
        
        // Validasi input
        if (!nama || !umur || !kelas) {
            return res.status(400).json({ 
                error: "Data tidak lengkap",
                message: "Nama, umur, dan kelas harus diisi"
            });
        }
        
        const absensiData = {
            nama: nama.trim(),
            umur: parseInt(umur),
            kelas: kelas.trim(),
            waktu: waktu || new Date().toLocaleString('id-ID')
        };
        
        console.log("📝 Processing absensi:", absensiData);
        
        // Simpan ke file terlebih dahulu
        const fileSaved = saveAbsensiToFile(absensiData);
        
        // Format pesan untuk Telegram
        const telegramMessage = `
🎯 <b>ABSENSI BARU</b>

👤 <b>Nama:</b> ${absensiData.nama}
🎂 <b>Umur:</b> ${absensiData.umur} tahun
🏫 <b>Kelas:</b> ${absensiData.kelas}
⏰ <b>Waktu:</b> ${absensiData.waktu}

📊 Total absensi hari ini: ${getTodayAbsensiCount()}
        `.trim();
        
        // Kirim ke Telegram (tidak blocking)
        let telegramSent = false;
        try {
            telegramSent = await sendTelegramMessage(telegramMessage);
        } catch (error) {
            console.error("❌ Failed to send to Telegram:", error.message);
        }
        
        // Response berdasarkan status
        if (fileSaved && telegramSent) {
            res.status(200).json({
                success: true,
                message: "Absensi berhasil dikirim ke Telegram dan disimpan!",
                data: absensiData
            });
        } else if (fileSaved) {
            res.status(206).json({
                success: true,
                message: "Absensi disimpan, tapi gagal dikirim ke Telegram",
                data: absensiData,
                warning: "Telegram tidak terhubung"
            });
        } else {
            res.status(500).json({
                error: "Gagal menyimpan absensi",
                message: "Terjadi kesalahan sistem"
            });
        }
        
    } catch (error) {
        console.error("❌ Error in /api/absen:", error);
        res.status(500).json({
            error: "Server error",
            message: "Terjadi kesalahan pada server"
        });
    }
});

// Hitung absensi hari ini
function getTodayAbsensiCount() {
    try {
        if (!fs.existsSync(absensiFile)) return 0;
        
        const data = JSON.parse(fs.readFileSync(absensiFile, 'utf8'));
        const today = new Date().toDateString();
        
        return data.filter(item => {
            const itemDate = new Date(item.timestamp || item.waktu).toDateString();
            return itemDate === today;
        }).length;
    } catch (error) {
        console.error("Error counting today's absensi:", error);
        return 0;
    }
}

// Endpoint untuk lihat data absensi
app.get("/api/absensi", (req, res) => {
    try {
        if (!fs.existsSync(absensiFile)) {
            return res.json({ data: [], count: 0 });
        }
        
        const data = JSON.parse(fs.readFileSync(absensiFile, 'utf8'));
        res.json({
            data: data,
            count: data.length,
            todayCount: getTodayAbsensiCount()
        });
    } catch (error) {
        console.error("Error reading absensi data:", error);
        res.status(500).json({ error: "Failed to read data" });
    }
});

// Endpoint Webhook dari Telegram
app.post(`/webhook/${TELEGRAM_BOT_TOKEN}`, async (req, res) => {
    try {
        const message = req.body.message;
        if (!message || !message.text) {
            return res.sendStatus(200);
        }

        const chatId = message.chat.id;
        const text = message.text.toLowerCase().trim();
        const userName = message.from.first_name || "User";

        console.log(`📱 Telegram command received: ${text} from ${userName}`);

        let responseText = "";

        switch (text) {
            case "/start":
                responseText = `Halo ${userName}! 👋\n\nBot Absensi siap digunakan!\n\nPerintah yang tersedia:\n/cekabsen - Lihat daftar absensi\n/help - Bantuan`;
                break;
                
            case "/help":
                responseText = `🤖 <b>BANTUAN BOT ABSENSI</b>\n\n/start - Mulai bot\n/cekabsen - Lihat semua absensi\n/hari-ini - Absensi hari ini\n/help - Tampilkan bantuan ini`;
                break;
                
            case "/cekabsen":
            case "/hari-ini":
                if (!fs.existsSync(absensiFile)) {
                    responseText = "📋 Belum ada data absensi.";
                } else {
                    const absensiList = JSON.parse(fs.readFileSync(absensiFile, 'utf8'));
                    
                    if (absensiList.length === 0) {
                        responseText = "📋 Belum ada data absensi.";
                    } else {
                        let filteredData = absensiList;
                        
                        if (text === "/hari-ini") {
                            const today = new Date().toDateString();
                            filteredData = absensiList.filter(item => {
                                const itemDate = new Date(item.timestamp || item.waktu).toDateString();
                                return itemDate === today;
                            });
                        }
                        
                        if (filteredData.length === 0) {
                            responseText = "📋 Tidak ada absensi hari ini.";
                        } else {
                            const title = text === "/hari-ini" ? "ABSENSI HARI INI" : "SEMUA ABSENSI";
                            responseText = `📊 <b>${title}</b>\n\n`;
                            
                            filteredData.forEach((item, index) => {
                                responseText += `${index + 1}. <b>${item.nama}</b>\n`;
                                responseText += `   👤 ${item.umur} tahun | 🏫 ${item.kelas}\n`;
                                responseText += `   ⏰ ${item.waktu}\n\n`;
                            });
                            
                            responseText += `📈 Total: ${filteredData.length} absensi`;
                        }
                    }
                }
                break;
                
            default:
                responseText = `Maaf, perintah "${text}" tidak dikenali.\n\nKetik /help untuk melihat daftar perintah.`;
        }

        // Kirim response ke Telegram
        await sendTelegramMessage(responseText);
        res.sendStatus(200);
        
    } catch (error) {
        console.error("❌ Error in webhook:", error);
        res.sendStatus(500);
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error("❌ Unhandled error:", error);
    res.status(500).json({ 
        error: "Internal server error",
        message: "Terjadi kesalahan pada server"
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: "Not found",
        message: "Endpoint tidak ditemukan"
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📱 Webhook URL: http://localhost:${PORT}/webhook/${TELEGRAM_BOT_TOKEN}`);
    
    // Test koneksi Telegram saat startup
    const telegramConnected = await testTelegramConnection();
    if (telegramConnected) {
        console.log("✅ Server ready with Telegram integration");
    } else {
        console.log("⚠️  Server ready but Telegram integration failed");
    }
    
    console.log("---");
    console.log("🔗 Available endpoints:");
    console.log("   GET  /              - Web form");
    console.log("   GET  /api/health    - Health check");
    console.log("   POST /api/absen     - Submit attendance");
    console.log("   GET  /api/absensi   - View all attendance");
    console.log("   POST /webhook/...   - Telegram webhook");
});
