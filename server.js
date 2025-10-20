// ======================================================
// 📦 IMPORT MODULE SERVER.JS
// ======================================================
import fs from "fs";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";
import { snapsave } from "snapsave-media-downloader";
import { spawn, exec } from "child_process";
import os from "os";

// ======================================================
// ⚙️ SETUP DASAR
// ======================================================
const app = express();
app.use(express.json());

// Header CORS global
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ======================================================
// 📁 PATH & KONSTANTA
// ======================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = process.cwd();
const projectPath = path.join(os.homedir(), "storage", "downloads", "node_projects");
const PORT = process.env.PORT || 3000;

// ======================================================
// 🧹 AUTO CLEANER UNTUK FILE .d.ts
// ======================================================
function deleteDTS(filePath) {
  if (!filePath.endsWith(".d.ts")) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log("🗑️ Hapus otomatis:", filePath);
    }
  } catch (err) {
    console.warn("⚠️ Gagal hapus:", filePath, "-", err.message);
  }
}

function deleteAllDTS(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) deleteAllDTS(fullPath);
    else deleteDTS(fullPath);
  });
}

const nodeModulesPath = path.join(projectRoot, "node_modules");
if (fs.existsSync(nodeModulesPath)) {
  console.log("🧹 Menghapus semua file .d.ts di node_modules...");
  deleteAllDTS(nodeModulesPath);
}

// ======================================================
// 🧰 API UNTUK JALANKAN COMMAND TERMUX (opsional)
// ======================================================
const logFile = path.join(projectRoot, "command.log");
function logToFile(message) {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch (err) {
    console.error("⚠️ Gagal menulis log:", err.message);
  }
}

app.post("/api/command", (req, res) => {
  const { cmd } = req.body;

  if (!cmd || typeof cmd !== "string") {
    return res.status(400).json({ success: false, error: "Perintah tidak valid." });
  }

  const allowed = ["npm", "cd", "ls", "pwd", "bash", "node"];
  if (!allowed.some((prefix) => cmd.trim().startsWith(prefix))) {
    return res.status(403).json({ success: false, error: "Perintah tidak diizinkan." });
  }

  console.log(`🟡 Menjalankan perintah: ${cmd} di folder ${projectPath}`);
  logToFile(`🟡 Menjalankan perintah: ${cmd}`);

  const parts = cmd.split(" ");
  const mainCmd = parts.shift();

  const child = spawn(mainCmd, parts, { cwd: projectPath });

  let output = "";
  let errorOutput = "";

  child.stdout.on("data", (data) => {
    output += data.toString();
  });

  child.stderr.on("data", (data) => {
    errorOutput += data.toString();
  });

  child.on("close", (code) => {
    logToFile(`✅ Selesai (${cmd}) -> code: ${code}`);
    res.json({
      success: code === 0,
      output: output || "Tidak ada output.",
      error: errorOutput,
    });
  });

  child.on("error", (err) => {
    logToFile(`❌ Gagal menjalankan: ${cmd} -> ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  });
});

// ======================================================
// 📥 API DOWNLOAD MENGGUNAKAN SNAPSAVE
// ======================================================
app.post("/api/download", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: "URL tidak boleh kosong" });

    console.log("📥 Permintaan download diterima untuk URL:", url);
    const result = await snapsave(url);
    const data = result?.data;

    if (!data?.media?.length) {
      console.log("❌ Tidak ada media ditemukan.");
      return res.status(404).json({ success: false, error: "Tidak ada media ditemukan." });
    }

    const validMedia = data.media.filter(
      (m) =>
        m.url &&
        m.url.startsWith("http") &&
        !m.url.includes("undefined") &&
        !m.url.includes("null")
    );

    if (validMedia.length === 0) {
      return res.status(400).json({ success: false, error: "Media tidak valid atau URL tidak bisa diputar." });
    }

    console.log(`✅ ${validMedia.length} media valid ditemukan untuk URL: ${url}`);

    res.json({
      success: true,
      data: {
        description: data.description || "",
        preview: data.preview || "",
        media: validMedia.map((m) => ({
          resolution: m.resolution || "Unknown",
          url: m.url,
          type: m.type || "unknown",
        })),
      },
    });
  } catch (err) {
    console.error("❌ ERROR SERVER:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================================================
// 🌐 PROXY UNTUK GET.PHP
// ======================================================
app.get("/proxy/get.php", async (req, res) => {
  const { send, source } = req.query;
  if (!send) {
    return res.status(400).json({ status: "error", message: "Missing 'send' parameter." });
  }

  const targetUrl = `https://shtl.pw/getmylink/get.php?send=${send}&source=${source || ""}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeout);

    const data = await response.json();

    if (data.status === "error" && /wrong type of the web page content/i.test(data.message || "")) {
      try {
        const relayResponse = await fetch(send);
        const contentType = relayResponse.headers.get("content-type") || "video/mp4";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", 'inline; filename="video.mp4"');
        relayResponse.body.pipe(res);
        return;
      } catch (relayErr) {
        return res.status(500).json({
          status: "error",
          message: `Relay fallback failed: ${relayErr.message}`,
        });
      }
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: `Failed to connect to get.php: ${error.message}`,
    });
  }
});



// ======================================================
// 🚀 Jalankan server
// ======================================================
app.listen(PORT, () => {
  console.log(`✅ Server aktif di port ${PORT}`);

  // Hanya jalankan Termux command kalau environment-nya Android
  if (os.platform() === "android") {
    setTimeout(() => {
      exec("termux-open-url http://localhost:3000/", (err) => {
        if (err) console.error("⚠️ Gagal membuka browser otomatis:", err.message);
        else console.log("🌐 Browser dibuka otomatis di http://localhost:3000/");
      });
    }, 3000);
  }
});