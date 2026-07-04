const express = require('express');
const { Telegraf } = require('telegraf');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const BOT_TOKEN = '8840836546:AAGFOcysBt7GpyCLyXcqk8KCsLrHgjjN30Q';
const ADMIN_ID = 8379904990;
const bot = new Telegraf(BOT_TOKEN);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const DB_PATH = './database.json';
if (!fs.existsSync(DB_PATH)) {
    fs.writeJsonSync(DB_PATH, { users: {}, bots_market: [], maintenance: false });
}

const getDB = () => fs.readJsonSync(DB_PATH);
const saveDB = (data) => fs.writeJsonSync(DB_PATH, data);

const storage = multer.diskStorage({
    destination: './uploads/php_scripts',
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

app.get('/api/data', (req, res) => res.json(getDB()));

app.post('/api/admin/toggle-status', (req, res) => {
    let db = getDB();
    db.maintenance = !db.maintenance;
    saveDB(db);
    res.json({ status: db.maintenance });
});

bot.start((ctx) => {
    ctx.reply(`ZcVirtual-ga xush kelibsiz!`, {
        reply_markup: { inline_keyboard: [[{ text: "Ilovani ochish 🚀", web_app: { url: "https://SIZNING_DOMENINGIZ.uz" } }]] }
    });
});

bot.launch();
app.listen(3000, () => console.log('Pro Server running on port 3000'));