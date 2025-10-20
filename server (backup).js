// ======================================================
// 📦 IMPORT MODULE
// ======================================================
import fs from "fs";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";
import { snapsave } from "snapsave-media-downloader";
import { spawn } from "child_process";
import os from "os";

// ======================================================
// ⚙️ SETUP DASAR
// ======================================================
const app = express();
app.use(express.json());

// Tambahkan header CORS untuk semua endpoint
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
const projectPath = path.join(os.homedir(), "storage", "downloads", "node_projects");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = process.cwd();
const PORT = 3000;

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

  fs.watch(nodeModulesPath, { recursive: true }, (event, filename) => {
    if (filename?.endsWith(".d.ts")) {
      const fullPath = path.join(nodeModulesPath, filename);
      if (fs.existsSync(fullPath)) deleteDTS(fullPath);
    }
  });

  console.log("👀 Watcher aktif di node_modules (khusus file .d.ts).");
} else {
  console.log("ℹ️ Folder node_modules belum ada, lewati pembersihan awal.");
}

// ======================================================
// 🧰 API UNTUK JALANKAN COMMAND TERMUX
// ======================================================
const logFile = path.join(projectPath, "command.log");

// Fungsi logging ke file
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
  if (!allowed.some(prefix => cmd.trim().startsWith(prefix))) {
    return res.status(403).json({ success: false, error: "Perintah tidak diizinkan." });
  }

  console.log(`🟡 Menjalankan perintah: ${cmd} di folder ${projectPath}`);
  logToFile(`🟡 Menjalankan perintah: ${cmd}`);

  // Pisahkan command dan argumen agar spawn bisa bekerja
  const parts = cmd.split(" ");
  const mainCmd = parts.shift();

  const child = spawn(mainCmd, parts, { cwd: projectPath });

  let output = "";
  let errorOutput = "";

  child.stdout.on("data", (data) => {
    const text = data.toString();
    output += text;
    console.log("📤", text.trim());
  });

  child.stderr.on("data", (data) => {
    const text = data.toString();
    errorOutput += text;
    console.error("⚠️", text.trim());
  });

  child.on("close", (code) => {
    console.log(`✅ Proses selesai (code: ${code})`);
    logToFile(`✅ Selesai (${cmd}) -> code: ${code}`);
    res.json({
      success: code === 0,
      output: output || "Tidak ada output.",
      error: errorOutput,
    });
  });

  child.on("error", (err) => {
    console.error("❌ Gagal menjalankan proses:", err.message);
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
    if (!url)
      return res.status(400).json({ success: false, error: "URL tidak boleh kosong" });

    console.log("📥 Permintaan download diterima untuk URL:", url);
    const result = await snapsave(url);
    const data = result?.data;

    if (!data?.media?.length) {
      console.log("❌ Tidak ada media ditemukan.");
      return res.status(404).json({ success: false, error: "Tidak ada media ditemukan." });
    }

    // 🔹 Validasi hanya media dengan URL yang benar-benar valid
    const validMedia = data.media.filter(
      (m) =>
        m.url &&
        m.url.startsWith("http") &&
        !m.url.includes("undefined") &&
        !m.url.includes("null")
    );

    if (validMedia.length === 0) {
      console.log("⚠️ Semua media tidak valid untuk URL:", url);
      return res.status(400).json({ success: false, error: "Media tidak valid atau URL tidak bisa diputar." });
    }

    console.log(`✅ ${validMedia.length} media valid ditemukan untuk URL: ${url}`);
    validMedia.forEach((m, i) => {
      console.log(`   [${i + 1}] ${m.type} - ${m.resolution || "Unknown"} → ${m.url}`);
    });

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

  // Encode parameter untuk keamanan
  const url = `https://shtl.pw/getmylink/get.php?send=${(send)}&source=${(source || '')}`;
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("❌ Error in /proxy/get.php:", error.message);
    res.status(500).json({
      status: "error",
      message: `Failed to connect to get.php: ${error.message}`,
    });
  }
});

// ======================================================
// 🌐 Sajikan file statis dari folder yang sama
// ======================================================
app.use(express.static(__dirname));

// ======================================================
// 🚀 Jalankan server tunggal
// ======================================================
app.listen(PORT, () => {
  console.log(`✅ Server aktif di http://localhost:${PORT}`);
  console.log(`📂 Folder kerja: ${projectPath}`);
});