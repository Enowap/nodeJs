#!/bin/bash
set -e

# ===============================
# 🚀 Auto Server Starter for Termux
# ===============================

# 🎨 Warna teks
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 📂 Tentukan folder proyek
PROJECT_DIR="$HOME/storage/downloads/node_projects"

# 🔍 Pastikan folder proyek ada
if [ ! -d "$PROJECT_DIR" ]; then
  echo -e "${RED}❌ Folder proyek tidak ditemukan di:${NC} $PROJECT_DIR"
  echo -e "${YELLOW}📁 Membuat folder baru...${NC}"
  mkdir -p "$PROJECT_DIR"
  echo -e "${GREEN}✅ Folder berhasil dibuat.${NC}"
fi

# 🧭 Masuk ke direktori proyek
cd "$PROJECT_DIR" || {
  echo -e "${RED}❌ Gagal masuk ke folder proyek.${NC}"
  exit 1
}

# ===============================
# ⚙️ CEK & INSTAL NODE.JS
# ===============================
if ! command -v node &> /dev/null; then
  echo -e "${YELLOW}📦 Node.js belum terinstal, menginstal...${NC}"
  pkg install -y nodejs
  echo -e "${GREEN}✅ Node.js berhasil diinstal.${NC}"
else
  echo -e "${GREEN}✅ Node.js sudah terinstal.${NC}"
fi

# ===============================
# ⚙️ CEK DEPENDENCY NPM
# ===============================
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}📦 Menginstal dependency (express, snapsave-media-downloader)...${NC}"
  npm install express snapsave-media-downloader
  echo -e "${GREEN}✅ Dependency berhasil diinstal.${NC}"
else
  # Cek apakah express & snapsave sudah ada
  if [ -d "node_modules/express" ] && [ -d "node_modules/snapsave-media-downloader" ]; then
    echo -e "${GREEN}✅ Semua dependency sudah terinstal. Lewati instalasi.${NC}"
  else
    echo -e "${YELLOW}📦 Beberapa dependency hilang, melengkapi instalasi...${NC}"
    npm install express snapsave-media-downloader
    echo -e "${GREEN}✅ Dependency telah dilengkapi.${NC}"
  fi
fi

# ===============================
# ▶️ JALANKAN SERVER DENGAN AUTO-RESTART
# ===============================
echo -e "${GREEN}🚀 Menjalankan server Node.js...${NC}"

while true; do
  node server.js
  echo -e "${YELLOW}🛑 Server dihentikan. Restart dalam 3 detik...${NC}"
  sleep 3
done