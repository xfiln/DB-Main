const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("node:fs");
const mime = require("mime-types");
const fetch = require("node-fetch");

// API Keys configuration
const GEMINI_API_KEY = global.gemini;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const lann = global.lann;

// Generation config for Gemini API
const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

// Main handler - Handles on/off functionality for AI session
const handler = async (m, { conn, text }) => {
  conn.chatSessions = conn.chatSessions || {};

  if (!text) throw "• Example: autoai [on/off]";

  if (text === "on") {
    conn.chatSessions[m.sender] = { messages: [], useOmega: false };
    m.reply("[ ✓ ] Success create session chat");
  } else if (text === "off") {
    delete conn.chatSessions[m.sender];
    m.reply("[ ✓ ] Success delete session chat");
  }
};

// Process messages before command handling
handler.before = async (m, { conn }) => {
  conn.chatSessions = conn.chatSessions || {};

  if (m.isBaileys && m.fromMe) return; // Skip if message is from bot itself
  if (!m.text) return; // Skip if not text message
  if (!conn.chatSessions[m.sender]) return; // Skip if no active session

  // Handle standard commands with prefix
  if (["", "#", "!", "/"].some((prefix) => m.text.startsWith(prefix))) {
    const cmdWithPrefix = m.text.substring(1).split(" ")[0].toLowerCase();
    const args = m.text.split(" ").slice(1);

    if (cmdWithPrefix === "grup" || cmdWithPrefix === "group") {
      const isGroup = m.isGroup;
      const isAdmin = isGroup ? m.isAdmin || m.isSuperAdmin : false;
      const isBotAdmin = isGroup ? m.isBotAdmin : false;

      if (!isGroup) {
        m.reply("⚠️ Perintah ini hanya bisa digunakan di dalam grup");
        return true; // Mark as handled
      }

      if (!isAdmin) {
        m.reply("⚠️ Kamu bukan admin grup");
        return true; // Mark as handled
      }

      if (!isBotAdmin) {
        m.reply("⚠️ Bot harus menjadi admin untuk melakukan perintah ini");
        return true; // Mark as handled
      }

      const subCommand = args[0]?.toLowerCase();

      if (subCommand === "open" || subCommand === "buka") {
        await conn.groupSettingUpdate(m.chat, "not_announcement");
        m.reply("[ ✓ ] Grup telah dibuka");
        return true; // Mark as handled
      } else if (subCommand === "close" || subCommand === "tutup") {
        await conn.groupSettingUpdate(m.chat, "announcement");
        m.reply("[ ✓ ] Grup telah ditutup");
        return true; // Mark as handled
      } else if (subCommand === "name" || subCommand === "nama") {
        const newName = args.slice(1).join(" ").trim();
        if (!newName) {
          m.reply("⚠️ Masukkan nama grup baru");
          return true; // Mark as handled
        }
        await conn.groupUpdateSubject(m.chat, newName);
        m.reply(`[ ✓ ] Nama grup diubah menjadi *${newName}*`);
        return true; // Mark as handled
      } else if (subCommand === "add" || subCommand === "tambah") {
        const number = args.slice(1).join("").trim().replace(/[^0-9]/g, "");
        if (!number) {
          m.reply("⚠️ Masukkan nomor yang valid");
          return true; // Mark as handled
        }

        // Format the number to international format
        const formattedNumber = number.startsWith("0")
          ? `62${number.substring(1)}@s.whatsapp.net`
          : `${number.includes("@") ? number : `${number}@s.whatsapp.net`}`;

        try {
          await conn.groupParticipantsUpdate(m.chat, [formattedNumber], "add");
          m.reply(`[ ✓ ] Berhasil menambahkan ${formattedNumber.split("@")[0]} ke grup`);
        } catch (error) {
          console.error("Error adding participant:", error);
          m.reply(`⚠️ Gagal menambahkan anggota: ${error.message}`);
        }
        return true; // Mark as handled
      } else if (subCommand === "omega") {
        conn.chatSessions[m.sender].useOmega = true;
        m.reply("[ ✓ ] Beralih ke model Omega AI");
        return true; // Mark as handled
      } else if (subCommand === "gemini") {
        conn.chatSessions[m.sender].useOmega = false;
        m.reply("[ ✓ ] Beralih ke model Gemini AI");
        return true; // Mark as handled
      }
    }

    return; // Continue handling for other commands
  }

  // Process chat with AI
  const isImageRequest = [
    "buatkan gambar",
    "generate gambar",
    "gambar",
    "editkan",
    "edit gambar",
    "ubahlah gambar",
    "ubahkan gambar",
    "ubah gambar",
  ].some((phrase) => m.text.toLowerCase().includes(phrase));

  const useOmega = conn.chatSessions[m.sender].useOmega || false;

  if (isImageRequest) {
    await processImageRequest(m, conn);
  } else if (useOmega) {
    await processOmegaRequest(m, conn);
  } else {
    await processGeminiTextRequest(m, conn);
  }
};

// Process text requests using Gemini API
async function processGeminiTextRequest(m, conn) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const history = conn.chatSessions[m.sender].messages || [];
  const messages = [...history, { role: "user", parts: [{ text: m.text }] }];

  try {
    await conn.sendMessage(m.chat, { react: { text: "⏱️", key: m.key } });

    const chatSession = model.startChat({ generationConfig, history: messages });
    const result = await chatSession.sendMessage(m.text);
    const replyText = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ Tidak ada respons dari Gemini API";

    await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
    m.reply(replyText);

    // Update session history
    conn.chatSessions[m.sender].messages.push({ role: "user", parts: [{ text: m.text }] });
    conn.chatSessions[m.sender].messages.push({ role: "model", parts: [{ text: replyText }] });

    // Limit history to prevent excessive token usage
    if (conn.chatSessions[m.sender].messages.length > 20) {
      conn.chatSessions[m.sender].messages = conn.chatSessions[m.sender].messages.slice(-20);
    }
  } catch (error) {
    console.error("Error in Gemini text processing:", error);
    await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
    m.reply(`⚠️ Terjadi kesalahan saat menghubungi Gemini API: ${error.message}`);
  }
}

// Process image generation requests using Gemini API
async function processImageRequest(m, conn) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp-image-generation" });

  try {
    await conn.sendMessage(m.chat, { react: { text: "⏱️", key: m.key } });

    const result = await model.generateContent(m.text);
    const response = result.response;
    const imageUrl = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (imageUrl) {
      const buffer = Buffer.from(imageUrl, "base64");
      const filename = `output_${Date.now()}.jpg`;
      fs.writeFileSync(filename, buffer);

      await conn.sendMessage(m.chat, {
        image: { url: filename },
        caption: "Berikut hasil gambarnya",
      });

      // Clean up the file after sending
      fs.unlinkSync(filename);
    } else {
      m.reply("⚠️ Tidak ada respons gambar dari Gemini API");
    }

    await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
  } catch (error) {
    console.error("Error in image generation:", error);
    await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
    m.reply(`⚠️ Terjadi kesalahan saat memproses gambar: ${error.message}`);
  }
}

// Process requests using Omega AI via BetaBotz API
async function processOmegaRequest(m, conn) {
  const logic = `Hai Saya Adalah Omega-AI Bot Whatsapp Yang Dikembangkan Oleh Paull. Saya Bernama Omega-AI. Saya Dibuat Oleh Paull Dengan Penuh Kesempurnaan Yang Tiada Tara. Jika Kamu Ingin Mencari Tau Lebih Dalam Tentang Ownerku Visit https://wa.me/12894272886. Saya suka sekali ngobrol dengan orang banyak`;

  try {
    await conn.sendMessage(m.chat, { react: { text: "⏱️", key: m.key } });

    const response = await fetch(
      `https://api.betabotz.eu.org/api/search/openai-logic?text=${encodeURIComponent(m.text)}&logic=${encodeURIComponent(logic)}&apikey=${lann}`
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.message || response.statusText}`);
    }

    const json = await response.json();

    if (!json.message) {
      throw new Error("Respons kosong dari API");
    }

    await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
    m.reply(json.message);

    // Omega AI does not support context/history
  } catch (error) {
    console.error("Error in Omega AI processing:", error);
    await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
    m.reply(`⚠️ Terjadi kesalahan saat menggunakan Omega AI: ${error.message}`);
  }
}

handler.command = ["autoai"];
handler.tags = ["ai"];
handler.help = ["autoai"].map((a) => a + " [on/off]");

module.exports = handler;