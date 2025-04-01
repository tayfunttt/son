const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const webPush = require("web-push");

const app = express();

// CORS ayarı (frontend alan adını burada belirt)
app.use(cors({
  origin: "https://parpar.it",
  methods: ["GET", "POST"]
}));

app.use(express.json());
app.use(express.static("public"));

const server = http.createServer(app);

// Socket.IO CORS ayarı
const io = socketIo(server, {
  cors: {
    origin: "https://parpar.it",
    methods: ["GET", "POST"]
  }
});

// VAPID bilgileri — kendine ait olanları buraya koy
webPush.setVapidDetails(
  "mailto:you@example.com",
  "BMYLktPLerCw_7_1ucqHoTjuoRq-JNWwRDb0kyRE3A_NqXSk6sssDjCLPJsTaJkfXVZMC2Lvrn_SNGNsgoFfe_Q",
  "yS0l3kmTelAEEKIiycpWhi8hgxwFGPKOdfdQ85tEGFU"
);

let subscriptions = {};
let onlineUsers = {};

app.post("/subscribe", (req, res) => {
  const { userId, subscription } = req.body;
  subscriptions[userId] = subscription;
  fs.writeFileSync("subscriptions.json", JSON.stringify(subscriptions, null, 2));
  res.status(201).json({ message: "Subscription saved." });
});

io.on("connection", (socket) => {
  console.log("Yeni bağlantı:", socket.id);

  socket.on("register", (userId) => {
    onlineUsers[userId] = socket.id;
    console.log(`${userId} bağlandı`);
  });

  socket.on("sendMessage", ({ from, to, message }) => {
    const msgData = { from, message, timestamp: Date.now() };

    if (onlineUsers[to]) {
      io.to(onlineUsers[to]).emit("receiveMessage", msgData);
    } else {
      const filePath = `./log-${to}.json`;
      let log = [];

      if (fs.existsSync(filePath)) {
        log = JSON.parse(fs.readFileSync(filePath));
      }

      log.push(msgData);
      fs.writeFileSync(filePath, JSON.stringify(log, null, 2));

      if (subscriptions[to]) {
        const payload = JSON.stringify({
          title: "Yeni mesaj!",
          body: `${from} seni arıyor.`
        });

        webPush.sendNotification(subscriptions[to], payload).catch(err => {
          console.error("Push gönderilemedi:", err);
        });
      }
    }
  });

  socket.on("getOfflineMessages", (userId) => {
    const filePath = `./log-${userId}.json`;
    if (fs.existsSync(filePath)) {
      const messages = JSON.parse(fs.readFileSync(filePath));
      socket.emit("offlineMessages", messages);
      fs.unlinkSync(filePath);
    }
  });

  socket.on("disconnect", () => {
    for (const [userId, id] of Object.entries(onlineUsers)) {
      if (id === socket.id) {
        delete onlineUsers[userId];
        console.log(`${userId} bağlantısı kesildi`);
        break;
      }
    }
  });
});

server.listen(3000, () => {
  console.log("Server 3000 portunda çalışıyor");
});
