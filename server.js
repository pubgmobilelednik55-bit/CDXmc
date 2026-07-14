const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 🤖 YANGI BOT SOZLAMALARI
const BOT_TOKEN = '8863574542:AAHqMgNB7m8P8MbG1iFVA2aqg1TUUSUG9Bw';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// YANGI ADMIN ID VA KARTA MA'LUMOTLARI
const ADMIN_ID = 8683151446; 
const KARTA_RAQAM = "4916990355543858";
const KARTA_EHASI = "SHARIFAXON XODJIMOVA";

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
        karta_egasi: KARTA_EHASI,
        isAdmin: parseInt(user_id) === ADMIN_ID,
        user: user,
        orders: userOrders
    });
});

// 💳 BALANS TO'LDIRISH SO'ROVI (Faoliyat turi: "Balans")
app.post('/api/deposit', (req, res) => {
    const { user_id, amount, tx_id } = req.body;
    const user = db.users[user_id];

    if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

    const orderId = Date.now();
    const newOrder = {
        id: orderId,
        user_id: user_id,
        username: user.username,
        type: 'deposit', // Balans to'ldirish turi
        amount: parseInt(amount),
        stars: 0, 
        tx_id: tx_id,
        status: 'Kutilmoqda',
        date: new Date().toISOString()
    };

    db.orders.push(newOrder);
    saveDB();

    const adminMessage = `💳 <b>Yangi Balans To'ldirish So'rovi!</b>\n\n` +
                         `👤 Foydalanuvchi: <a href="tg://user?id=${user_id}">${user.username}</a> (ID: ${user_id})\n` +
                         `💰 To'lov miqdori: ${parseInt(amount).toLocaleString()} so'm\n` +
                         `🆔 Chek ID: <code>${tx_id}</code>`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "✅ To'lovni tasdiqlash", callback_data: `approve_dep_${orderId}` },
                { text: "❌ Bekor qilish", callback_data: `reject_dep_${orderId}` }
            ]
        ]
    };

    bot.sendMessage(ADMIN_ID, adminMessage, { parse_mode: 'HTML', reply_markup: keyboard })
       .catch(err => console.log("Adminga xabar yuborishda xato:", err.message));

    res.json({ success: true, order: newOrder });
});

// ⭐ BALANSDAN STARS SOTIB OLISH (Hisobdan darhol pul yechiladi)
app.post('/api/buy-stars', (req, res) => {
    const { user_id, stars, price, target_username } = req.body;
    const user = db.users[user_id];

    if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

    // Hisobni tekshirish
    if (user.balance < parseInt(price)) {
        return res.status(400).json({ error: "Hisobingizda mablag' yetarli emas! Iltimos, oldin balansingizni to'ldiring." });
    }

    // Balansdan pul yechish
    user.balance -= parseInt(price);

    const orderId = Date.now();
    const newOrder = {
        id: orderId,
        user_id: user_id,
        username: user.username,
        type: 'stars_purchase', // Stars xarid turi
        amount: parseInt(price),
        stars: parseInt(stars),
        target_username: target_username,
        status: 'Kutilmoqda',
        date: new Date().toISOString()
    };

    db.orders.push(newOrder);
    saveDB();

    const adminMessage = `⭐ <b>Yangi Stars Buyurtmasi!</b> (Balansdan to'landi)\n\n` +
                         `👤 Kimdan: <a href="tg://user?id=${user_id}">${user.username}</a> (ID: ${user_id})\n` +
                         `🎯 Qabul qiluvchi User: <code>${target_username}</code>\n` +
                         `🌟 Miqdor: <b>${stars} Stars</b>\n` +
                         `💸 Yechilgan summa: ${parseInt(price).toLocaleString()} so'm`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "✅ Yetkazildi", callback_data: `complete_stars_${orderId}` },
                { text: "❌ Rad etish (Pul qaytariladi)", callback_data: `cancel_stars_${orderId}` }
            ]
        ]
    };

    bot.sendMessage(ADMIN_ID, adminMessage, { parse_mode: 'HTML', reply_markup: keyboard })
       .catch(err => console.log("Adminga xabar yuborishda xato:", err.message));

    res.json({ success: true, user_balance: user.balance, order: newOrder });
});

// 👑 ADMIN: STATISTIKA
app.post('/api/admin/stats', (req, res) => {
    const { admin_id } = req.body;
    if (parseInt(admin_id) !== ADMIN_ID) return res.status(403).json({ error: "Taqiqlangan!" });
    res.json({
        total_users: Object.keys(db.users).length,
        pending_orders: db.orders.filter(o => o.status === 'Kutilmoqda').length,
        site_status: db.site_status
    });
});

// 👑 ADMIN: BOT ON/OFF
app.post('/api/admin/toggle-site', (req, res) => {
    const { admin_id, status } = req.body;
    if (parseInt(admin_id) !== ADMIN_ID) return res.status(403).json({ error: "Taqiqlangan!" });
    db.site_status = status;
    saveDB();
    res.json({ success: true, site_status: db.site_status });
});

// 👑 ADMIN: BALANS TO'LDIRISH/KAMAYTIRISH
app.post('/api/admin/manage-balance', (req, res) => {
    const { admin_id, target_user_id, action, amount } = req.body;
    if (parseInt(admin_id) !== ADMIN_ID) return res.status(403).json({ error: "Taqiqlangan!" });

    const user = db.users[target_user_id];
    if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

    const val = parseInt(amount);
    if (action === 'add') {
        user.balance += val;
        bot.sendMessage(target_user_id, `💰 Hisobingizga <b>${val.toLocaleString()} so'm</b> qo'shildi!`, { parse_mode: 'HTML' }).catch(() => {});
    } else if (action === 'sub') {
        user.balance = Math.max(0, user.balance - val);
        bot.sendMessage(target_user_id, `📉 Hisobingizdan <b>${val.toLocaleString()} so'm</b> ayirildi!`, { parse_mode: 'HTML' }).catch(() => {});
    }
    saveDB();
    res.json({ success: true, current_balance: user.balance });
});

// 👑 ADMIN: GLOBAL REKLAMA/XABAR TARQATISH
app.post('/api/admin/broadcast', async (req, res) => {
    const { admin_id, message } = req.body;
    if (parseInt(admin_id) !== ADMIN_ID) return res.status(403).json({ error: "Taqiqlangan!" });

    const userIds = Object.keys(db.users);
    let successCount = 0;

    for (const userId of userIds) {
        try {
            await bot.sendMessage(userId, message, { parse_mode: 'HTML' });
            successCount++;
        } catch (err) {
            console.log(`Xabar yuborilmadi ID: ${userId}`);
        }
    }

    res.json({ success: true, sent_count: successCount });
});

// 🕹️ CALLBACK BUTTONS PROCESSING
bot.on('callback_query', async (query) => {
    const data = query.data;
    const messageId = query.message.message_id;

    // 1. Balans to'ldirishni tasdiqlash
    if (data.startsWith('approve_dep_')) {
        const orderId = data.split('_')[2];
        const order = db.orders.find(o => o.id == orderId);

        if (order && order.status === 'Kutilmoqda') {
            order.status = 'Tasdiqlandi';
            if (db.users[order.user_id]) {
                db.users[order.user_id].balance += order.amount;
            }
            saveDB();

            bot.editMessageText(query.message.text + `\n\n🟢 <b>HOLAT: To'lov tasdiqlandi</b>`, { chat_id: ADMIN_ID, message_id: messageId, parse_mode: 'HTML' });
            bot.sendMessage(order.user_id, `✅ <b>Hisobingiz to'ldirildi!</b>\n\nBalansingizga <b>${order.amount.toLocaleString()} so'm</b> muvaffaqiyatli qo'shildi.`, { parse_mode: 'HTML' }).catch(() => {});
        }
    }

    // 2. Balans to'ldirishni rad etish
    if (data.startsWith('reject_dep_')) {
        const orderId = data.split('_')[2];
        const order = db.orders.find(o => o.id == orderId);

        if (order && order.status === 'Kutilmoqda') {
            order.status = 'Rad etildi';
            saveDB();

            bot.editMessageText(query.message.text + `\n\n🔴 <b>HOLAT: To'lov rad etildi</b>`, { chat_id: ADMIN_ID, message_id: messageId, parse_mode: 'HTML' });
            bot.sendMessage(order.user_id, `❌ <b>To'lov so'rovingiz rad etildi!</b>\n\nAgar xatolik bo'lsa, qayta urinib ko'ring yoki adminga yozing.`, { parse_mode: 'HTML' }).catch(() => {});
        }
    }

    // 3. Stars yetkazilganini tasdiqlash
    if (data.startsWith('complete_stars_')) {
        const orderId = data.split('_')[2];
        const order = db.orders.find(o => o.id == orderId);

        if (order && order.status === 'Kutilmoqda') {
            order.status = 'Yetkazib berildi';
            if (db.users[order.user_id]) {
                db.users[order.user_id].total_bought += order.stars;
            }
            saveDB();

            bot.editMessageText(query.message.text + `\n\n🟢 <b>HOLAT: Stars muvaffaqiyatli yetkazildi!</b>`, { chat_id: ADMIN_ID, message_id: messageId, parse_mode: 'HTML' });
            bot.sendMessage(order.user_id, `🎉 <b>Xushxabar!</b>\n\nSiz sotib olgan <b>${order.stars} Stars</b> Telegram profilingizga muvaffaqiyatli yuborildi! Rahmat!`, { parse_mode: 'HTML' }).catch(() => {});
        }
    }

    // 4. Stars buyurtmasini rad etish va pulni balansga qaytarish
    if (data.startsWith('cancel_stars_')) {
        const orderId = data.split('_')[2];
        const order = db.orders.find(o => o.id == orderId);

        if (order && order.status === 'Kutilmoqda') {
            order.status = 'Rad etildi';
            if (db.users[order.user_id]) {
                db.users[order.user_id].balance += order.amount; // Pulni qaytarish
            }
            saveDB();

            bot.editMessageText(query.message.text + `\n\n🔴 <b>HOLAT: Rad etildi (Mablag' balansga qaytarildi)</b>`, { chat_id: ADMIN_ID, message_id: messageId, parse_mode: 'HTML' });
            bot.sendMessage(order.user_id, `❌ <b>Sizning Stars buyurtmangiz rad etildi!</b>\n\n<b>${order.amount.toLocaleString()} so'm</b> hisobingizga to'liq qaytarib berildi.`, { parse_mode: 'HTML' }).catch(() => {});
        }
    }
});

// 🚀 /START BUYRUG'I
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    checkUser(chatId, msg.from.username || msg.from.first_name);

    const RENDER_SAYT_URL = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'fragstore-mini-app.onrender.com'}`;

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
    console.log(`🚀 Real-time server ${PORT}-portda muvaffaqiyatli ishga tushdi...`);
});
