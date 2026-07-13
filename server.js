const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 🤖 SIZNING BOT TOKENINGIZ
const BOT_TOKEN = '8982318226:AAEcRUNuNwQOHxsqqaNGBARXPqH_hHuBlhc';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Admin ID va Karta ma'lumotlari
const ADMIN_ID = 8379904990; 
const KARTA_RAQAM = "9860080332461054";

// 📂 REAL-TIME BAZA (JSON fayl)
const DB_FILE = path.join(__dirname, 'database.json');
let db = {
    users: {},       
    orders: [],      
    site_status: true 
};

if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.log("Bazani yuklashda xatolik:", e);
    }
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function checkUser(userId, username = 'Foydalanuvchi') {
    if (!db.users[userId]) {
        db.users[userId] = {
            username: username || 'Foydalanuvchi',
            balance: 0,
            total_bought: 0,
            status: 'Client'
        };
        saveDB();
    }
    return db.users[userId];
}

app.use(express.static(path.join(__dirname)));

// 🌐 MINI APP API INTERFEYSLARI
app.post('/api/init', (req, res) => {
    const { user_id, username } = req.body;
    if (!user_id) return res.status(400).json({ error: "User ID kerak" });

    if (!db.site_status && parseInt(user_id) !== ADMIN_ID) {
        return res.json({ maintenance: true });
    }

    const user = checkUser(user_id, username);
    const userOrders = db.orders.filter(o => o.user_id == user_id);

    res.json({
        maintenance: false,
        karta: KARTA_RAQAM,
        isAdmin: parseInt(user_id) === ADMIN_ID,
        user: user,
        orders: userOrders
    });
});

app.post('/api/order', (req, res) => {
    const { user_id, amount, stars, tx_id } = req.body;
    const user = db.users[user_id];

    if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

    const orderId = Date.now();
    const newOrder = {
        id: orderId,
        user_id: user_id,
        username: user.username,
        amount: parseInt(amount),
        stars: parseInt(stars),
        tx_id: tx_id,
        status: 'Kutilmoqda',
        date: new Date().toISOString()
    };

    db.orders.push(newOrder);
    saveDB();

    const adminMessage = `🔔 <b>Yangi Buyurtma!</b>\n\n` +
                         `👤 Foydalanuvchi: <a href="tg://user?id=${user_id}">${user.username}</a> (ID: ${user_id})\n` +
                         `💰 To'langan miqdor: ${amount} so'm\n` +
                         `⭐ Miqdori (Stars): ${stars} Stars\n` +
                         `🆔 Chek ID: <code>${tx_id}</code>`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "✅ Qabul qilish", callback_data: `accept_${orderId}` },
                { text: "❌ Rad etish", callback_data: `reject_${orderId}` }
            ]
        ]
    };

    bot.sendMessage(ADMIN_ID, adminMessage, { parse_mode: 'HTML', reply_markup: keyboard })
       .catch(err => console.log("Adminga yuborishda xato:", err.message));

    res.json({ success: true, order: newOrder });
});

app.post('/api/admin/stats', (req, res) => {
    const { admin_id } = req.body;
    if (parseInt(admin_id) !== ADMIN_ID) return res.status(403).json({ error: "Taqiqlangan!" });
    res.json({
        total_users: Object.keys(db.users).length,
        pending_orders: db.orders.filter(o => o.status === 'Kutilmoqda').length,
        site_status: db.site_status
    });
});

app.post('/api/admin/toggle-site', (req, res) => {
    const { admin_id, status } = req.body;
    if (parseInt(admin_id) !== ADMIN_ID) return res.status(403).json({ error: "Taqiqlangan!" });
    db.site_status = status;
    saveDB();
    res.json({ success: true, site_status: db.site_status });
});

app.post('/api/admin/manage-balance', (req, res) => {
    const { admin_id, target_user_id, action, amount } = req.body;
    if (parseInt(admin_id) !== ADMIN_ID) return res.status(403).json({ error: "Taqiqlangan!" });

    const user = db.users[target_user_id];
    if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

    const val = parseInt(amount);
    if (action === 'add') {
        user.balance += val;
        bot.sendMessage(target_user_id, `💰 Hisobingizga <b>${val} so'm</b> qo'shildi!`, { parse_mode: 'HTML' }).catch(() => {});
    } else if (action === 'sub') {
        user.balance = Math.max(0, user.balance - val);
        bot.sendMessage(target_user_id, `📉 Hisobingizdan <b>${val} so'm</b> ayirildi!`, { parse_mode: 'HTML' }).catch(() => {});
    }
    saveDB();
    res.json({ success: true, current_balance: user.balance });
});

bot.on('callback_query', async (query) => {
    const data = query.data;
    const messageId = query.message.message_id;

    if (data.startsWith('accept_')) {
        const orderId = data.split('_')[1];
        const order = db.orders.find(o => o.id == orderId);

        if (order && order.status === 'Kutilmoqda') {
            order.status = 'Qabul qilindi';
            if (db.users[order.user_id]) db.users[order.user_id].total_bought += order.stars;
            saveDB();

            bot.editMessageText(query.message.text + `\n\n🟢 <b>HOLAT: Qabul qilindi</b>`, { chat_id: ADMIN_ID, message_id: messageId, parse_mode: 'HTML' });
            bot.sendMessage(order.user_id, `✅ <b>Buyurtmangiz qabul qilindi!</b>\n\n⭐ ${order.stars} Stars muvaffaqiyatli yetkazildi. Rahmat!`, { parse_mode: 'HTML' }).catch(() => {});
        }
    }

    if (data.startsWith('reject_')) {
        const orderId = data.split('_')[1];
        const order = db.orders.find(o => o.id == orderId);

        if (order && order.status === 'Kutilmoqda') {
            order.status = 'Rad etildi';
            saveDB();

            bot.editMessageText(query.message.text + `\n\n🔴 <b>HOLAT: Rad etildi</b>`, { chat_id: ADMIN_ID, message_id: messageId, parse_mode: 'HTML' });
            bot.sendMessage(order.user_id, `❌ <b>Buyurtmangiz rad etildi!</b>\n\nMablag'ingiz qaytariladi. Muammo bo'lsa, adminga murojaat qiling.`, { parse_mode: 'HTML' }).catch(() => {});
        }
    }
});

// 🚀 /START BUYRUG'I VA TEXT SOZLAMA
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    checkUser(chatId, msg.from.username || msg.from.first_name);

    const RENDER_SAYT_URL = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'fragstore-mini-app.onrender.com'}`;

    // Aynan siz xohlagan matn
    const text = `Salom 👋\nArzon stars kerak bolsa siz unda pastdagi ilovani oching tugmasini bosing`;
    
    const keyboard = {
        inline_keyboard: [
            [
                { text: "🚀 Ilovani oching", web_app: { url: RENDER_SAYT_URL } }
            ]
        ]
    };

    bot.sendMessage(chatId, text, { reply_markup: keyboard });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Real-time server ${PORT}-portda ishlamoqda...`);
});
