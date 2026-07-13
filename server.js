const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// PORT sozlamasi (Render uchun)
const PORT = process.env.PORT || 3000;

// 🛑 TELEGRAM BOT SOZLAMALARI
// Bot tokeningizni shu yerga yozing yoki Render Environment Variable'ga kiriting
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Admin ID va Karta ma'lumotlari
const ADMIN_ID = 8379904990;
const KARTA_RAQAM = "9860080332461054";

// 📂 MA'LUMOTLAR BAZASI (Sodda faylli baza Render uchun)
const DB_FILE = path.join(__dirname, 'database.json');
let db = {
    users: {},       // { telegram_id: { username, balance, total_bought, status } }
    orders: [],      // [ { id, user_id, username, amount, stars, tx_id, status, date } ]
    site_status: true // true = ON, false = OFF (Texnik ishlar)
};

// Bazani yuklash
if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.log("Baza yuklashda xatolik:", e);
    }
}

// Bazani saqlash funksiyasi
function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

// Foydalanuvchini tekshirish yoki yaratish
function checkUser(userId, username = 'No Name') {
    if (!db.users[userId]) {
        db.users[userId] = {
            username: username || 'No Name',
            balance: 0,
            total_bought: 0,
            status: 'Client'
        };
        saveDB();
    }
    return db.users[userId];
}

// Frontend fayllarini tarqatish
app.use(express.static(path.join(__dirname)));

// 🌐 API ENPOINTS

// Sayt holati va Foydalanuvchi ma'lumotlarini olish
app.post('/api/init', (req, Brun) => {
    const { user_id, username } = req.body;
    if (!user_id) return Brun.status(400).json({ error: "User ID kerak" });

    // Agar bot OFF bo'lsa va kirgan odam admin bo'lmasa — texnik ishlar ko'rsatiladi
    if (!db.site_status && parseInt(user_id) !== ADMIN_ID) {
        return Brun.json({ maintenance: true });
    }

    const user = checkUser(user_id, username);
    const userOrders = db.orders.filter(o => o.user_id == user_id);

    Brun.json({
        maintenance: false,
        karta: KARTA_RAQAM,
        isAdmin: parseInt(user_id) === ADMIN_ID,
        user: user,
        orders: userOrders
    });
});

// Yangi to'lov/buyurtma yuborish
app.post('/api/order', (req, Brun) => {
    const { user_id, amount, stars, tx_id } = req.body;
    const user = db.users[user_id];

    if (!user) return Brun.status(404).json({ error: "Foydalanuvchi topilmadi" });

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

    // Adminga xabar yuborish (Inline tugmalar bilan)
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
       .catch(err => console.log("Adminga xabar yuborishda xato:", err.message));

    Brun.json({ success: true, order: newOrder });
});

// 📊 ADMIN API: Statistika va Boshqaruv
app.post('/api/admin/stats', (req, Brun) => {
    const { admin_id } = req.body;
    if (parseInt(admin_id) !== ADMIN_ID) return Brun.status(403).json({ error: "Taqiqlangan!" });

    const totalUsers = Object.keys(db.users).length;
    const pendingOrders = db.orders.filter(o => o.status === 'Kutilmoqda').length;
    
    Brun.json({
        total_users: totalUsers,
        pending_orders: pendingOrders,
        site_status: db.site_status
    });
});

// ADMIN API: Botni yoqish/o'chirish
app.post('/api/admin/toggle-site', (req, Brun) => {
    const { admin_id, status } = req.body;
    if (parseInt(admin_id) !== ADMIN_ID) return Brun.status(403).json({ error: "Taqiqlangan!" });

    db.site_status = status;
    saveDB();
    Brun.json({ success: true, site_status: db.site_status });
});

// ADMIN API: Balans qo'shish yoki ayirish
app.post('/api/admin/manage-balance', (req, Brun) => {
    const { admin_id, target_user_id, action, amount } = req.body;
    if (parseInt(admin_id) !== ADMIN_ID) return Brun.status(403).json({ error: "Taqiqlangan!" });

    const user = db.users[target_user_id];
    if (!user) return Brun.status(404).json({ error: "Foydalanuvchi topilmadi" });

    const val = parseInt(amount);
    if (action === 'add') {
        user.balance += val;
        bot.sendMessage(target_user_id, `💰 Admin hisobingizga <b>${val} so'm</b> qo'shdi!`, { parse_mode: 'HTML' }).catch(() => {});
    } else if (action === 'sub') {
        user.balance = Math.max(0, user.balance - val);
        bot.sendMessage(target_user_id, `📉 Admin hisobingizdan <b>${val} so'm</b> ayirdi!`, { parse_mode: 'HTML' }).catch(() => {});
    }

    saveDB();
    Brun.json({ success: true, current_balance: user.balance });
});


// 🤖 TELEGRAM BOT CALLBACK HANDLERS (Admindan kelgan so'rovlar)
bot.on('callback_query', async (query) => {
    const data = query.data;
    const messageId = query.message.message_id;

    if (data.startsWith('accept_')) {
        const orderId = data.split('_')[1];
        const order = db.orders.find(o => o.id == orderId);

        if (order && order.status === 'Kutilmoqda') {
            order.status = 'Qabul qilindi';
            
            // Foydalanuvchi statistikasini yangilash
            if (db.users[order.user_id]) {
                db.users[order.user_id].total_bought += order.stars;
            }
            saveDB();

            // Adminga bildirishnoma
            bot.editMessageText(query.message.text + `\n\n🟢 <b>HOLAT: Qabul qilindi</b>`, {
                chat_id: ADMIN_ID,
                message_id: messageId,
                parse_mode: 'HTML'
            });

            // Foydalanuvchiga bildirishnoma
            bot.sendMessage(order.user_id, `✅ <b>Buyurtmangiz qabul qilindi!</b>\n\n⭐ ${order.stars} Stars muvaffaqiyatli yetkazildi. Rahmat!`, { parse_mode: 'HTML' }).catch(() => {});
        }
    }

    if (data.startsWith('reject_')) {
        const orderId = data.split('_')[1];
        const order = db.orders.find(o => o.id == orderId);

        if (order && order.status === 'Kutilmoqda') {
            order.status = 'Rad etildi';
            saveDB();

            // Adminga bildirishnoma
            bot.editMessageText(query.message.text + `\n\n🔴 <b>HOLAT: Rad etildi (Pul qaytariladi)</b>`, {
                chat_id: ADMIN_ID,
                message_id: messageId,
                parse_mode: 'HTML'
            });

            // Foydalanuvchiga bildirishnoma
            bot.sendMessage(order.user_id, `❌ <b>Buyurtmangiz rad etildi!</b>\n\nMablag'ingiz qaytariladi. Muammo bo'lsa, adminga murojaat qiling.`, { parse_mode: 'HTML' }).catch(() => {});
        }
    }
});

// Botni start buyrug'i uchun (Mini App havolasini ulash oson bo'lishi uchun)
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    checkUser(chatId, msg.from.username);
    bot.sendMessage(chatId, `👋 Salom! FragStore botga xush kelibsiz.\n\nStars sotib olish uchun quyidagi Web App tugmasini bosing!`);
});

// Barcha noto'g'ri URL'larni index.html'ga yo'naltirish (SPA oson ishlashi uchun)
app.get('*', (req, Brun) => {
    Brun.sendFile(path.join(__dirname, 'index.html'));
});

// Serverni ishga tushirish
app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT}-portda muvaffaqiyatli ishlamoqda...`);
});
