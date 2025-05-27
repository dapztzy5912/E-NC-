const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
const PORT = 3000;

const TELEGRAM_BOT_TOKEN = "8046810663:AAEDKWWGJeCA6us-g0j7RuZniHlKxSLqgSw";
const TELEGRAM_USER_ID = "7333629874"; 

const absensiFile = path.join(__dirname, "absensi.json");

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));

// Tampilkan halaman form
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Handle absen
app.post("/api/absen", async (req, res) => {
    const { nama, umur, kelas, waktu } = req.body;
    const data = { nama, umur, kelas, waktu };

    let list = [];
    if (fs.existsSync(absensiFile)) {
        list = JSON.parse(fs.readFileSync(absensiFile));
    }
    list.push(data);
    fs.writeFileSync(absensiFile, JSON.stringify(list, null, 2));

    const text = `Woi Bang Ada Yang Absen Nih:\nNama: ${nama}\nUmur: ${umur}\nKelas: ${kelas}\nWaktu: ${waktu}`;
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TELEGRAM_USER_ID,
        text
    });

    res.send(`<p>Absensi berhasil dikirim!</p><a href="/">Kembali</a>`);
});

// Endpoint Webhook dari Telegram
app.post(`/webhook/${TELEGRAM_BOT_TOKEN}`, async (req, res) => {
    const message = req.body.message;
    if (!message || !message.text) return res.sendStatus(200);

    const chatId = message.chat.id;
    const text = message.text;

    if (text === "/cekabsen") {
        let responseText = "Daftar Absensi:\n\n";

        if (fs.existsSync(absensiFile)) {
            const list = JSON.parse(fs.readFileSync(absensiFile));

            if (list.length === 0) {
                responseText = "Belum ada data absensi.";
            } else {
                list.forEach((item, index) => {
                    responseText += `${index + 1}. ${item.nama} | ${item.umur} th | ${item.kelas} | ${item.waktu}\n`;
                });
            }
        } else {
            responseText = "File absensi tidak ditemukan.";
        }

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: responseText
        });
    }

    res.sendStatus(200);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server jalan di http://localhost:${PORT}`);
});
