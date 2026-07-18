import express from 'express';
import { Bot, InputFile } from 'grammy';
import { GoogleGenAI } from "@google/genai";
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

// Konfiguratsiyalar
const BOT_TOKEN = '8795596399:AAFTrUd1qR-PcRR5MSo0IwwhWQT7Kw8I-wA';
const GEMINI_API_KEY = 'AQ.Ab8RN6JWz0tuJbFzgQCnV0NoChsmMkvyBL2xXksrZ52ehch9sg';
const ADMIN_ID = 123456789; // BU YERGA O'ZINGIZNING TELEGRAM ID RAQAMINGIZNI YOZING!

const bot = new Bot(BOT_TOKEN);
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Bot buyruqlari
bot.command('start', async (ctx) => {
    await ctx.reply(`Salom AlsoAiga xush kelibsiz 😅\nilovani oching va boshlang`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Ilovani ochish", web_app: { url: `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:3000'}` } }]
            ]
        }
    });
});

// Gemini AI API handler
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        const interaction = await ai.interactions.create({
            model: "gemini-3.5-flash",
            input: message,
        });
        res.json({ reply: interaction.output_text });
    } catch (error) {
        console.error(error);
        res.status(500).json({ reply: "Gemini AI bilan bog'lanishda xatolik." });
    }
});

// Premium to'lov chekini adminga yuborish
app.post('/api/premium', upload.single('receipt'), async (req, res) => {
    try {
        const user = JSON.parse(req.body.user);
        const file = req.file;

        if (!file) return res.status(400).send('Fayl yuklanmadi');

        const caption = `💳 **Yangi Premium Ariza!**\n\n👤 Foydalanuvchi: ${user.first_name || ''} ${user.last_name || ''}\n🆔 ID: ${user.id}\n🔗 Username: @${user.username || 'yoq'}`;

        await bot.api.sendPhoto(ADMIN_ID, new InputFile(file.buffer, file.originalname), {
            caption: caption,
            parse_mode: 'Markdown'
        });

        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(500).send('Xatolik yuz berdi');
    }
});

// Portni sozlash va ishga tushirish
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server ${PORT}-portda ishlamoqda`);
    bot.start();
});
