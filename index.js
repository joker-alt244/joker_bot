/*
 * © 2026 xJoker (VOIDSEC)
 *
 * ⚠️ COPYRIGHT NOTICE
 * This source code is protected under copyright law.
 * Any form of re-uploading, recoding, modification,
 * selling, or redistribution WITHOUT explicit permission
 * from the original author is strictly prohibited.
 *
 * ❌ NO CREDIT = NO PERMISSION
 * ❌ DO NOT CLAIM THIS CODE AS YOUR OWN
 *
 */

const {
    TelegramClient,
    Api
} = require("telegram");
const {
    StringSession
} = require("telegram/sessions");
const {
    NewMessage
} = require("telegram/events");
const {
    log
} = require("@sabir7718/log");
const abuse = require("@sabir7718/abuse-detector");
const yts = require("yt-search");
const axios = require("axios");
require('dotenv').config();
const os = require("os");
const fs = require('fs');

const apiId = parseInt(process.env.API_ID, 10);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.STRING_SESSION);

const firebaseURL = process.env.FIREBASE_URL;

const getDB = async () => {
    try {
        const res = await axios.get(firebaseURL);
        return res.data || {
            prefix: "/",
            owner: "705530419"
        };
    } catch (e) {
        return {
            prefix: "/",
            owner: "705530419"
        };
    }
};

const updateDB = async (data) => {
    try {
        await axios.put(firebaseURL, data);
    } catch (e) {
        log("error", "FIREBASE", e.message);
    }
};

const formatSize = (bytes) => (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
const getRuntime = (sec) => new Date(sec * 1000).toISOString().substr(11, 8);

const keepOnline = (client) => {
    setInterval(async () => {
        try {
            await client.invoke(new Api.account.UpdateStatus({
                offline: false
            }));
            if (Math.random() < 0.1) log("info", "STATUS", "✅ Online status refreshed");
        } catch (e) {
            console.log("Online status error:", e.message);
        }
    }, 10000);
};

(async () => {
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5
    });
    await client.connect();
    log("info", "SYSTEM", "VOID-X Pro Online! Firebase & Public Mode Active.");

    keepOnline(client);

    client.addEventHandler(async (update) => {
        try {
            if (update.className !== "UpdatePhoneCall") return;

            const call = update.phoneCall;
            if (!call || call.className !== "PhoneCallRequested") return;

            let db = await getDB();
            if (!db.anticall) return;

            const inputCall = new Api.InputPhoneCall({
                id: call.id,
                accessHash: call.accessHash
            });

            await client.invoke(new Api.phone.DiscardCall({
                peer: inputCall,
                duration: 0,
                reason: new Api.PhoneCallDiscardReasonBusy(),
                connectionId: 0
            }));

        } catch (e) {
            console.log("AntiCall Error:", e.message);
        }
    });

    client.addEventHandler(async (event) => {
        const message = event.message;
        if (!message || !message.message) return;

        let db = await getDB();
        const currentPrefix = db.prefix || "/";
        const budy = message.message;

        if (!budy.startsWith(currentPrefix)) return;

        const args = budy.slice(currentPrefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        const text = args.join(" ");
        const isOwner = message.out;
        const chatId = message.chatId.toString();

        if (message.isGroup && db.antiabuse) {

            const isAdmin = (await client.getParticipants(chatId))
                .some(a => a.id.toString() === message.senderId?.toString() && (a.adminRights || a.creator));

            if (isAdmin || isOwner) return;

            try {
                const result = await abuse.check(budy);

                if (result?.abusive || result?.isAbusive || result === true) {

                    await client.deleteMessages(chatId, [message.id], {
                        revoke: true
                    });

                    await message.reply({
                        message: "🚫 Abuse detected! Message removed."
                    });

                    return;
                }

            } catch (e) {
                console.log("Anti-abuse error:", e.message);
            }
        }

        db.antilink = db.antilink ?? false;
        db.warn = db.warn ?? {};

        if (db.antilink) {

            if (!message.isGroup) return;

            const admins = await client.getParticipants(chatId);

            const isBotAdmin = admins.some(a => a.adminRights || a.creator);
            if (!isBotAdmin) return;

            const isUserAdmin = admins.some(a =>
                a.id.toString() === message.senderId?.toString() &&
                (a.adminRights || a.creator)
            );

            if (isUserAdmin || isOwner) return;

            const linkRegex = /(https?:\/\/|www\.|t\.me\/|telegram\.me\/)/i;

            if (linkRegex.test(budy)) {

                db.warn[message.senderId] = (db.warn[message.senderId] || 0) + 1;

                await client.deleteMessages(chatId, [message.id], {
                    revoke: true
                });

                await message.reply({
                    message: `🚫 ANTI-LINK\n⚠️ Warn: ${db.warn[message.senderId]}/3`
                });

                if (db.warn[message.senderId] >= 3) {
                    await client.kickParticipant(chatId, message.senderId);
                    db.warn[message.senderId] = 0;
                }

                return;
            }
        }

        if (command === "antiabuse") {

            if (!message.isGroup) {
                return message.reply({
                    message: "❌ Only works in groups"
                });
            }

            const admins = await client.getParticipants(chatId);

            const isUserAdmin = admins.some(a =>
                a.id.toString() === message.senderId?.toString() &&
                (a.adminRights || a.creator)
            );

            if (!isUserAdmin && !isOwner) {
                return message.reply({
                    message: "❌ You are not admin"
                });
            }

            db.antiabuse = !db.antiabuse;

            await message.reply({
                message: `🛡 Anti-Abuse: ${db.antiabuse ? "ON" : "OFF"}`
            });
        }

        if (command === "ptv") {
            const replied = await message.getReplyMessage();
            if (!replied || !replied.media) {
                return await message.reply({
                    message: "<b>❌ Reply to a video, brother!</b>",
                    parseMode: "html"
                });
            }

            const status = await message.reply({
                message: "🔄 <code>Force Converting to PTV...</code>",
                parseMode: "html"
            });

            try {
                const buffer = await client.downloadMedia(replied);

                let duration = 0;
                if (replied.media.document && replied.media.document.attributes) {
                    const vAttr = replied.media.document.attributes.find(a => a.className === 'DocumentAttributeVideo');
                    if (vAttr) duration = vAttr.duration;
                }

                await client.sendFile(message.chatId, {
                    file: buffer,
                    videoNote: true,
                    replyTo: replied.id,
                    attributes: [
                        new Api.DocumentAttributeVideo({
                            w: 384,
                            h: 384,
                            duration: duration,
                            roundMessage: true,
                            supportsStreaming: true
                        })
                    ]
                });

                await client.sendFile(message.chatId, {
                    file: buffer,
                    forceDocument: true,
                    replyTo: replied.id,
                    attributes: [
                        new Api.DocumentAttributeFilename({
                            fileName: `VOID-X_${Date.now()}.mp4`
                        })
                    ]
                });

                await client.deleteMessages(message.chatId, [status.id], {
                    revoke: true
                });
            } catch (e) {
                await client.editMessage(message.chatId, {
                    message: status.id,
                    text: `❌ <b>Failed:</b> <code>${e.message}</code>`,
                    parseMode: "html"
                });
            }
        }





        if (command === "ping") {
            const start = Date.now();
            const reply = await message.reply({
                message: "📡 <code>Processing...</code>",
                parseMode: "html"
            });
            const end = Date.now();
            await client.editMessage(chatId, {
                message: reply.id,
                text: `🚀 <b>Pong!</b>\n🛰 <b>Latency:</b> <code>${end - start}ms</code>\n⚙ <b>Status:</b> <code>Excellent</code>`,
                parseMode: "html"
            });
        }

        if (command === "menu") {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? "🌅 Good Morning" : hour < 17 ? "☀️ Good Afternoon" : "🌙 Good Night";

            const menu = `
<b>╭━━━━━━━━━━━━━━━━━━⬣</b>
<b>┃ ${greeting}, User 👋</b>
<b>╰━━━━━━━━━━━━━━━━━━⬣</b>

<b>╭─〔 SYSTEM INFO 💋 〕─</b>
<b>│</b> ⏱ <b>Runtime :</b> <code>${getRuntime(process.uptime())}</code>
<b>│</b> 🧠 <b>RAM :</b> <code>${formatSize(os.totalmem() - os.freemem())} / ${formatSize(os.totalmem())}</code>
<b>│</b> ⚙️ <b>Prefix :</b> <code>${currentPrefix}</code>
<b>╰──────────────────</b>

<b>╭─〔 DEVELOPER COMMANDS 👑 〕─</b>
<b>│</b> <code>${currentPrefix}prefix set &lt;symbol&gt;</code>
<b>│</b> <code>${currentPrefix}broadcast &lt;text&gt;</code>
<b>│</b> <code>${currentPrefix}anticall on/off</code>
<b>│</b> <code>${currentPrefix}spam &lt;count&gt; &lt;text&gt;</code>
<b>│</b> <code>${currentPrefix}exec &lt;code&gt;</code>
<b>│</b> <code>${currentPrefix}clean</code>
<b>╰──────────────────</b>

<b>╭─〔 ADMIN / GROUP 👤 〕─</b>
<b>│</b> <code>${currentPrefix}antilink on/off</code>
<b>│</b> <code>${currentPrefix}antiabuse</code>
<b>│</b> <code>${currentPrefix}tagall</code>
<b>│</b> <code>${currentPrefix}kick &lt;id&gt;</code>
<b>│</b> <code>${currentPrefix}promote &lt;id&gt;</code>
<b>│</b> <code>${currentPrefix}demote &lt;id&gt;</code>
<b>│</b> <code>${currentPrefix}del</code> (reply)
<b>╰──────────────────</b>

<b>╭─〔 FUN COMMANDS 🤩 〕─</b>
<b>│</b> <code>${currentPrefix}hack</code>
<b>│</b> <code>${currentPrefix}loading</code>
<b>│</b> <code>${currentPrefix}glitch &lt;text&gt;</code>
<b>│</b> <code>${currentPrefix}boom</code>
<b>│</b> <code>${currentPrefix}matrix</code>
<b>│</b> <code>${currentPrefix}count &lt;number&gt;</code>
<b>│</b> <code>${currentPrefix}reverse &lt;text&gt;</code>
<b>│</b> <code>${currentPrefix}roll</code>
<b>│</b> <code>${currentPrefix}fakechat</code>
<b>│</b> <code>${currentPrefix}rainbow &lt;text&gt;</code>
<b>│</b> <code>${currentPrefix}brain</code>
<b>│</b> <code>${currentPrefix}spamtype &lt;text&gt;</code>
<b>│</b> <code>${currentPrefix}guess</code>
<b>│</b> <code>${currentPrefix}timer &lt;seconds&gt;</code>
<b>│</b> <code>${currentPrefix}remind &lt;sec&gt; &lt;msg&gt;</code>
<b>│</b> <code>${currentPrefix}save &lt;key&gt; &lt;value&gt;</code>
<b>│</b> <code>${currentPrefix}get &lt;key&gt;</code>
<b>│</b> <code>${currentPrefix}choose option1,option2</code>
<b>│</b> <code>${currentPrefix}8ball &lt;question&gt;</code>
<b>╰──────────────────</b>

<b>╭─〔 MEDIA / UTILS 📡 〕─</b>
<b>│</b> <code>${currentPrefix}play &lt;song name&gt;</code>
<b>│</b> <code>${currentPrefix}video &lt;name&gt;</code>
<b>│</b> <code>${currentPrefix}ptv</code> (reply to video)
<b>│</b> <code>${currentPrefix}ping</code>
<b>│</b> <code>${currentPrefix}id</code>
<b>│</b> <code>${currentPrefix}info</code>
<b>│</b> <code>${currentPrefix}alive</code>
<b>│</b> <code>${currentPrefix}stats</code>
<b>│</b> <code>${currentPrefix}sys</code>
<b>│</b> <code>${currentPrefix}tempmsg &lt;text&gt;</code>
<b>│</b> <code>${currentPrefix}search &lt;query&gt;</code>
<b>╰──────────────────</b>

<b>╭━━━━━━━━━━━━━━━━━━⬣</b>
<b>┃ 𖤍 ⤷ 𝐉𝐎𝐊𝐄𝐑-𝐗-𝐏𝐑𝐎 ⤶</b>
<b>┃ 𖤍 ⤷ 𝐁𝐘 𝐎𝐖𝐍𝐄𝐑_𝐗_𝐉𝐎𝐊𝐄𝐑 ⤶</b>
<b>╰━━━━━━━━━━━━━━━━━━⬣</b>`;

            await message.reply({
                message: menu,
                parseMode: "html"
            });
        }

        if (command === "hack") {
            const msg = await message.reply({
                message: "💻 Initializing hack..."
            });

            const steps = [
                "🔍 Scanning target...",
                "📡 Connecting to server...",
                "🔐 Bypassing firewall...",
                "💣 Injecting payload...",
                "📂 Extracting data...",
                "🧠 Accessing brain...",
                "💀 Hack complete!"
            ];

            for (let i = 0; i < steps.length; i++) {
                await new Promise(r => setTimeout(r, 1200));
                await client.editMessage(chatId, {
                    message: msg.id,
                    text: steps[i]
                });
            }
        }

        if (command === "loading") {
            const msg = await message.reply({
                message: "⏳ Loading..."
            });

            const frames = [
                "[░░░░░░░░░░]",
                "[█░░░░░░░░░]",
                "[██░░░░░░░░]",
                "[███░░░░░░░]",
                "[████░░░░░░]",
                "[█████░░░░░]",
                "[██████░░░░]",
                "[███████░░░]",
                "[████████░░]",
                "[█████████░]",
                "[██████████]"
            ];

            for (let i = 0; i < frames.length; i++) {
                await new Promise(r => setTimeout(r, 300));
                await client.editMessage(chatId, {
                    message: msg.id,
                    text: `⚡ Processing\n${frames[i]}`
                });
            }
        }

        if (command === "glitch") {
            if (!text) return;

            const msg = await message.reply({
                message: text
            });

            const glitchChars = ["#", "@", "%", "&", "$", "*"];

            for (let i = 0; i < 10; i++) {
                let glitched = text.split("").map(c => {
                    return Math.random() > 0.7 ? glitchChars[Math.floor(Math.random() * glitchChars.length)] : c;
                }).join("");

                await new Promise(r => setTimeout(r, 200));
                await client.editMessage(chatId, {
                    message: msg.id,
                    text: glitched
                });
            }

            await client.editMessage(chatId, {
                message: msg.id,
                text: text
            });
        }

        if (command === "boom") {
            const msg = await message.reply({
                message: "💣"
            });

            const frames = [
                "💣",
                "💣 .",
                "💣 ..",
                "💣 ...",
                "💥 BOOM 💥",
                "🔥🔥🔥",
                "💀 Destroyed"
            ];

            for (let f of frames) {
                await new Promise(r => setTimeout(r, 500));
                await client.editMessage(chatId, {
                    message: msg.id,
                    text: f
                });
            }
        }

        if (command === "matrix") {
            const msg = await message.reply({
                message: "Initializing..."
            });

            const chars = "01#@$%&";

            for (let i = 0; i < 15; i++) {
                let line = "";
                for (let j = 0; j < 20; j++) {
                    line += chars[Math.floor(Math.random() * chars.length)];
                }

                await new Promise(r => setTimeout(r, 200));
                await client.editMessage(chatId, {
                    message: msg.id,
                    text: line
                });
            }

            await client.editMessage(chatId, {
                message: msg.id,
                text: "🧠 ACCESS GRANTED"
            });
        }

        if (command === "count") {
            const num = parseInt(text);
            if (!num) return;

            const msg = await message.reply({
                message: "0"
            });

            for (let i = 1; i <= num; i++) {
                await new Promise(r => setTimeout(r, 300));
                await client.editMessage(chatId, {
                    message: msg.id,
                    text: `${i}`
                });
            }
        }

        if (command === "reverse") {
            if (!text) return;

            const msg = await message.reply({
                message: text
            });

            let arr = text.split("");

            for (let i = arr.length; i >= 0; i--) {
                await new Promise(r => setTimeout(r, 150));
                await client.editMessage(chatId, {
                    message: msg.id,
                    text: arr.slice(0, i).join("")
                });
            }
        }
        if (command === "roll") {
            const msg = await message.reply({
                message: "🎲 Rolling..."
            });

            const dice = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

            for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 150));
                await client.editMessage(chatId, {
                    message: msg.id,
                    text: dice[Math.floor(Math.random() * 6)]
                });
            }

            await client.editMessage(chatId, {
                message: msg.id,
                text: `🎯 Result: ${dice[Math.floor(Math.random()*6)]}`
            });
        }

        if (command === "fakechat") {
            const msg = await message.reply({
                message: "👤 User: Hi"
            });

            const convo = [
                "🤖 Bot: Hello",
                "👤 User: Can you hack?",
                "🤖 Bot: Accessing...",
                "💻 System: Breached",
                "💀 Bot: Done"
            ];

            for (let line of convo) {
                await new Promise(r => setTimeout(r, 1000));
                await client.editMessage(chatId, {
                    message: msg.id,
                    text: line
                });
            }
        }

        if (command === "rainbow") {
            if (!text) return;

            const msg = await message.reply({
                message: text
            });

            const styles = [
                t => t.toUpperCase(),
                t => t.toLowerCase(),
                t => t.split("").join(" "),
                t => t.split("").reverse().join("")
            ];

            for (let i = 0; i < styles.length * 3; i++) {
                await new Promise(r => setTimeout(r, 200));
                await client.editMessage(chatId, {
                    message: msg.id,
                    text: styles[i % styles.length](text)
                });
            }
        }

        if (command === "brain") {
            const msg = await message.reply({
                message: "🧠 Thinking"
            });

            const dots = ["", ".", "..", "..."];

            for (let i = 0; i < 8; i++) {
                await new Promise(r => setTimeout(r, 400));
                await client.editMessage(chatId, {
                    message: msg.id,
                    text: "🧠 Thinking" + dots[i % dots.length]
                });
            }

            await client.editMessage(chatId, {
                message: msg.id,
                text: "💡 Idea generated!"
            });
        }

        if (command === "spamtype") {
            if (!text) return;

            const msg = await message.reply({
                message: ""
            });

            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 50));
                await client.editMessage(chatId, {
                    message: msg.id,
                    text: text.slice(0, Math.floor(Math.random() * text.length))
                });
            }

            await client.editMessage(chatId, {
                message: msg.id,
                text: text
            });
        }

        let S7guess = {};

        if (command === "guess") {
            const num = Math.floor(Math.random() * 10) + 1;
            S7guess[chatId] = num;

            await message.reply({
                message: "🎮 Guess number (1-10)"
            });
        }

        if (!budy.startsWith(currentPrefix) && S7guess[chatId]) {
            const guess = parseInt(budy);

            if (!isNaN(guess)) {
                if (guess === S7guess[chatId]) {
                    delete S7guess[chatId];
                    await message.reply({
                        message: "🎉 Correct!"
                    });
                } else {
                    await message.reply({
                        message: "❌ Wrong, try again"
                    });
                }
            }
        }

        if (command === "timer") {
            const sec = parseInt(args[0]);
            if (!sec) return await message.reply({
                message: "❌ Example: /timer 10"
            });

            await message.reply({
                message: `⏳ Timer set: ${sec}s`
            });

            setTimeout(async () => {
                await client.sendMessage(chatId, {
                    message: "⏰ Time up!"
                });
            }, sec * 1000);
        }

        if (command === "remind") {
            const sec = parseInt(args[0]);
            const msg = args.slice(1).join(" ");

            if (!sec || !msg) return;

            await message.reply({
                message: `🔔 Reminder set in ${sec}s`
            });

            setTimeout(async () => {
                await client.sendMessage(chatId, {
                    message: `🔔 Reminder:\n${msg}`
                });
            }, sec * 1000);
        }

        let S7notes = {};

        if (command === "save") {
            const key = args[0];
            const value = args.slice(1).join(" ");
            if (!key || !value) return;

            S7notes[key] = value;
            await message.reply({
                message: "✅ Saved"
            });
        }

        if (command === "get") {
            const key = args[0];
            if (!S7notes[key]) return await message.reply({
                message: "❌ Not found"
            });

            await message.reply({
                message: `📁 ${S7notes[key]}`
            });
        }

        if (command === "search") {
            if (!text) return;

            const res = await yts(text);
            const vids = res.videos.slice(0, 5);

            let out = "🔎 Results:\n\n";

            vids.forEach((v, i) => {
                out += `${i+1}. ${v.title}\n${v.url}\n\n`;
            });

            await message.reply({
                message: out
            });
        }

        if (command === "choose") {
            const opts = text.split(",");
            if (opts.length < 2) return;

            const pick = opts[Math.floor(Math.random() * opts.length)];
            await message.reply({
                message: `🤔 I choose: ${pick.trim()}`
            });
        }

        if (command === "8ball") {
            const replies = [
                "Yes",
                "No",
                "Maybe",
                "Definitely",
                "Ask later",
                "Impossible",
                "100% sure"
            ];

            const ans = replies[Math.floor(Math.random() * replies.length)];
            await message.reply({
                message: `🎱 ${ans}`
            });
        }

        if (command === "clean") {
            if (!isOwner) return;

            const msgs = await client.getMessages(chatId, {
                limit: 10
            });
            const ids = msgs.map(m => m.id);

            await client.deleteMessages(chatId, ids, {
                revoke: true
            });
        }

        if (command === "api") {
            const url = text;
            if (!url) return;

            try {
                const res = await axios.get(url);
                await message.reply({
                    message: JSON.stringify(res.data, null, 2)
                });
            } catch (e) {
                await message.reply({
                    message: "❌ API failed"
                });
            }
        }

        if (command === "sys") {
            const info = `
🖥 SYSTEM STATUS

CPU: ${os.cpus()[0].model}
RAM: ${formatSize(os.totalmem() - os.freemem())}
UPTIME: ${getRuntime(process.uptime())}
PLATFORM: ${os.platform()}
`;

            await message.reply({
                message: info
            });
        }

        if (command === "tempmsg") {
            const msg = await message.reply({
                message: text
            });

            setTimeout(async () => {
                await client.deleteMessages(chatId, [msg.id], {
                    revoke: true
                });
            }, 5000);
        }

        if (command === "exec") {
            if (!isOwner) return;

            const {
                exec
            } = require("child_process");

            exec(text, (err, stdout) => {
                if (err) return message.reply({
                    message: `❌ ${err.message}`
                });

                message.reply({
                    message: `💻 OUTPUT:\n\n${stdout || "No output"}`
                });
            });
        }

        if (command === "speed") {
            const start = Date.now();
            const msg = await message.reply({
                message: "⚡ Testing speed..."
            });

            await client.editMessage(chatId, {
                message: msg.id,
                text: `🚀 Speed: ${Date.now() - start}ms`
            });
        }

        if (command === "fakeerror") {
            const msg = await message.reply({
                message: "⚠️ SYSTEM ERROR"
            });

            const frames = [
                "⚠️ SYSTEM ERROR",
                "⚠️ MEMORY CORRUPTED",
                "⚠️ RECOVERING...",
                "⚠️ STABLE"
            ];

            for (let f of frames) {
                await new Promise(r => setTimeout(r, 700));
                await client.editMessage(chatId, {
                    message: msg.id,
                    text: f
                });
            }
        }

        if (command === "tagall") {
            if (!isOwner && !db.admins?.includes(from)) return;

            const members = await client.getParticipants(chatId);
            let textMsg = "📢 TAG ALL\n\n";

            members.forEach(m => {
                textMsg += `@${m.username || "user"} `;
            });

            await client.sendMessage(chatId, {
                message: textMsg
            });
        }

        if (command === "kick") {
            if (!isOwner && !db.admins?.includes(from)) return;

            const id = args[0];
            if (!id) return;

            await client.kickParticipant(chatId, id);
            await message.reply({
                message: `👢 Kicked ${id}`
            });
        }

        if (command === "promote") {
            if (!isOwner) return;

            const id = args[0];
            await client.editAdmin(chatId, id, true);
            await message.reply({
                message: "⬆️ Promoted"
            });
        }

        if (command === "demote") {
            if (!isOwner) return;

            const id = args[0];
            await client.editAdmin(chatId, id, false);
            await message.reply({
                message: "⬇️ Demoted"
            });
        }

        if (command === "inspect") {
            const sender = await message.getSender();

            const info = `
🧠 USER INSPECT

ID: ${sender.id}
Name: ${sender.firstName}
Username: @${sender.username || "none"}
Bot: ${sender.bot}
`;

            await message.reply({
                message: info
            });
        }

        if (command === "groupinfo") {
            const info = await client.getEntity(chatId);

            await message.reply({
                message: `📊 GROUP INFO\n\nName: ${info.title}\nID: ${chatId}`
            });
        }

        if (command === "del") {
            if (!isOwner && !db.admins?.includes(from)) return;

            const msg = await message.getReplyMessage();
            if (!msg) return;

            await client.deleteMessages(chatId, [msg.id], {
                revoke: true
            });
        }

        if (command === "video") {
            if (!text) return await message.reply({
                message: "❌ <b>Provide a video name!</b>",
                parseMode: "html"
            });

            try {
                const search = await yts(text);
                const video = search.videos[0];
                if (!video) return await message.reply({
                    message: "❌ <b>Not found!</b>",
                    parseMode: "html"
                });

                const status = await message.reply({
                    message: `📥 <b>Downloading Video:</b>\n<code>${video.title}</code>`,
                    parseMode: "html"
                });

                const api = `https://social-media-downloader-api-s7.onrender.com/videosyhate?url=${encodeURIComponent(video.url)}`;
                const res = await axios.get(api, {
                    timeout: 60000
                });

                if (res.data?.video_url) {
                    await client.sendFile(chatId, {
                        file: res.data.video_url,
                        caption: `🎬 <b>${video.title}</b>`,
                        parseMode: "html"
                    });
                    await client.deleteMessages(chatId, [status.id], {
                        revoke: true
                    });
                } else {
                    await client.editMessage(chatId, {
                        message: status.id,
                        text: "❌ <b>Failed!</b>",
                        parseMode: "html"
                    });
                }
            } catch (e) {
                log("error", "VIDEO", e.message);
            }
        }

        if (command === "antilink") {

            if (!message.isGroup) {
                return message.reply({
                    message: "❌ Only works in groups"
                });
            }

            const sub = args[0]?.toLowerCase();

            if (!sub || !["on", "off"].includes(sub)) {
                return message.reply({
                    message: "⚙️ Use: /antilink on OR /antilink off"
                });
            }

            const admins = await client.getParticipants(chatId);

            const isUserAdmin = admins.some(a =>
                a.id.toString() === from && (a.adminRights || a.creator)
            );

            if (!isUserAdmin && !isOwner) {
                return message.reply({
                    message: "❌ You are not admin"
                });
            }

            if (sub === "on") {
                db.antilink = true;
            } else {
                db.antilink = false;
            }

            await message.reply({
                message: `🔐 Anti-Link is now ${db.antilink ? "ON" : "OFF"}`
            });
        }

        if (command === "alive") {
            const txt = `
⚡ <b>VOID-X PRO ACTIVE</b>

👤 <b>Owner:</b> <code>${db.owner}</code>
⏱ <b>Uptime:</b> <code>${getRuntime(process.uptime())}</code>
🧠 <b>RAM:</b> <code>${formatSize(os.totalmem() - os.freemem())}</code>
🚀 <b>Status:</b> <code>Running Smoothly</code>
`;
            await message.reply({
                message: txt,
                parseMode: "html"
            });
        }

        if (command === "stats") {
            const dialogs = await client.getDialogs();

            const txt = `
📊 <b>BOT STATS</b>

👥 <b>Total Chats:</b> <code>${dialogs.length}</code>
⏱ <b>Uptime:</b> <code>${getRuntime(process.uptime())}</code>
🧠 <b>RAM Used:</b> <code>${formatSize(os.totalmem() - os.freemem())}</code>
⚙️ <b>Prefix:</b> <code>${currentPrefix}</code>
`;

            await message.reply({
                message: txt,
                parseMode: "html"
            });
        }

        if (command === "spam") {
            if (!isOwner) return;

            const count = parseInt(args[0]);
            const msg = args.slice(1).join(" ");

            if (!count || !msg) return await message.reply({
                message: "❌ Usage: /spam 5 hello",
                parseMode: "html"
            });

            for (let i = 0; i < count; i++) {
                await client.sendMessage(chatId, {
                    message: msg
                });
            }
        }

        if (command === "prefix") {
            if (!isOwner) return;
            const action = args[0];
            const newSymbol = args[1];
            if (action === "set" && newSymbol) {
                db.prefix = newSymbol;
                await updateDB(db);
                await message.reply({
                    message: `✅ <b>Prefix successfully set to:</b> <code>${newSymbol}</code>`,
                    parseMode: "html"
                });
            }
        }

        if (command === "id") {
            await message.reply({
                message: `🆔 <b>Chat ID:</b> <code>${chatId}</code>`,
                parseMode: "html"
            });
        }

        if (command === "info") {
            const sender = await message.getSender();
            const info = `👤 <b>User Info</b>\n\n<b>Name:</b> <code>${sender.firstName || "N/A"}</code>\n<b>Username:</b> @${sender.username || "N/A"}\n<b>ID:</b> <code>${sender.id}</code>`;
            await message.reply({
                message: info,
                parseMode: "html"
            });
        }

        if (command === "broadcast") {
            if (!isOwner) return;
            if (!text) return await message.reply({
                message: "❌ <b>Enter message to broadcast!</b>",
                parseMode: "html"
            });
            const dialogs = await client.getDialogs();
            let count = 0;
            for (const dialog of dialogs) {
                try {
                    await client.sendMessage(dialog.id, {
                        message: `📢 <b>BROADCAST</b>\n\n${text}`,
                        parseMode: "html"
                    });
                    count++;
                } catch (e) {}
            }
            await message.reply({
                message: `✅ <b>Broadcast sent to ${count} chats!</b>`,
                parseMode: "html"
            });
        }

        if (command === "emojiid") {

            const replied = await message.getReplyMessage();

            if (!replied) {
                return await message.reply({
                    message: "❌ Reply to emoji/sticker"
                });
            }

            try {

                let emojiId = null;

                if (replied.media?.document) {
                    emojiId = replied.media.document.id;
                }

                if (
                    replied.entities &&
                    replied.entities[0] &&
                    replied.entities[0].documentId
                ) {
                    emojiId = replied.entities[0].documentId;
                }

                if (!emojiId) {
                    return await message.reply({
                        message: "❌ Emoji ID not found"
                    });
                }

                await message.reply({
                    message: `🧩 EMOJI ID

🆔 ${emojiId}`
                });

            } catch (e) {

                await message.reply({
                    message: `❌ ${e.message}`
                });

            }
        }

        if (command === "getemoji") {

            const replied = await message.getReplyMessage();

            if (!replied || !replied.message) {
                return await message.reply({
                    message: "❌ Reply to a message"
                });
            }

            try {

                let text = replied.message;

                if (replied.entities && replied.entities.length > 0) {

                    const customEmojis = replied.entities
                        .filter(e => e.className === "MessageEntityCustomEmoji")
                        .sort((a, b) => b.offset - a.offset);

                    for (const emo of customEmojis) {

                        const start = emo.offset;
                        const end = start + emo.length;

                        text =
                            text.slice(0, start) +
                            `(emoji)${emo.documentId}(/emoji)` +
                            text.slice(end);
                    }
                }

                await message.reply({
                    message: text
                });

            } catch (e) {

                await message.reply({
                    message: `❌ ${e.message}`
                });
            }
        }

        if (command === "anticall") {

            if (!isOwner) {
                return message.reply({
                    message: "❌ Only owner can use this"
                });
            }

            const sub = args[0]?.toLowerCase();

            if (!sub || !["on", "off"].includes(sub)) {
                return message.reply({
                    message: "⚙️ Use: /anticall on OR /anticall off"
                });
            }

            if (sub === "on") {
                db.anticall = true;
            } else {
                db.anticall = false;
            }

            await updateDB(db);

            await message.reply({
                message: `📵 Anti-Call is now ${db.anticall ? "ON" : "OFF"}`
            });
        }

        if (["play", "song"].includes(command)) {
            if (!text) return await message.reply({
                message: "❌ <b>Provide a song name!</b>",
                parseMode: "html"
            });
            try {
                const search = await yts(text);
                const video = search.videos[0];
                if (!video) return await message.reply({
                    message: "❌ <b>Not found!</b>",
                    parseMode: "html"
                });

                const statusMsg = await message.reply({
                    message: `📥 <b>Downloading:</b> <code>${video.title}</code>`,
                    parseMode: "html"
                });

                let audioUrl = null;
                try {
                    const res1 = await axios.get(`https://social-media-downloader-api-s7.onrender.com/audiosyhate?url=${encodeURIComponent(video.url)}`, {
                        timeout: 60000
                    });
                    if (res1.data?.audio_url) audioUrl = res1.data.audio_url;
                } catch (e) {}

                if (audioUrl) {
                    await client.sendFile(message.chatId, {
                        file: audioUrl,
                        caption: `✅ <b>${video.title}</b>`,
                        parseMode: "html",
                        attributes: [new Api.DocumentAttributeAudio({
                            duration: video.seconds,
                            title: video.title,
                            performer: "VOID-X"
                        })]
                    });
                    await client.deleteMessages(message.chatId, [statusMsg.id], {
                        revoke: true
                    });
                } else {
                    await client.editMessage(message.chatId, {
                        message: statusMsg.id,
                        text: "❌ <b>Download failed!</b>",
                        parseMode: "html"
                    });
                }
            } catch (err) {
                log('error', 'SYSTEM', err.message);
            }
        }

    }, new NewMessage({}));
})();

const http = require("http");

const S7HaTeSY_server = http.createServer(async (req, res) => {

    if (req.url === "/") {

        const S7HaTeSY_data = {
            bot: "VOID-X PRO",
            status: "online",
            uptime: getRuntime(process.uptime()),
            ram: formatSize(os.totalmem() - os.freemem()),
            totalRam: formatSize(os.totalmem()),
            platform: os.platform(),
            owner: "SABIR7718",
            time: new Date().toISOString()
        };

        res.writeHead(200, {
            "Content-Type": "application/json"
        });
        return res.end(JSON.stringify(S7HaTeSY_data, null, 2));
    }

    if (req.url === "/health") {
        res.writeHead(200, {
            "Content-Type": "application/json"
        });
        return res.end(JSON.stringify({
            status: "ok"
        }));
    }

    res.writeHead(404, {
        "Content-Type": "application/json"
    });
    res.end(JSON.stringify({
        error: "Not Found"
    }));

});

const PORT = process.env.PORT || 3000;

S7HaTeSY_server.listen(PORT, () => {
    log("info", "HTTP", `Server running on port ${PORT}`);
});

if (process.env.URL) {

    (async () => {
        try {
            const res = await fetch(process.env.URL);
            log('info', 'PING', `Pinged: ${process.env.URL} | Status: ${res.status}`);
        } catch (err) {
            log('error', 'PING', err.message);
        }
    })();

    setInterval(async () => {
        try {
            const res = await fetch(process.env.URL);
            log('info', 'PING', `Pinged: ${process.env.URL} | Status: ${res.status}`);
        } catch (err) {
            log('error', 'PING', err.message);
        }
    }, 5 * 60 * 1000);
}