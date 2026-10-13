# NitroFlow

**Intelligent Windows System Optimizer** — Optimize your computer with 0 effort.

NitroFlow is a desktop application for Windows 10/11 that cleans up and tunes your PC with safety as the first priority. Version 1.3.0 adds one-click optimization with a health score, automatic Windows restore points, safer cleanup rules, plain-language startup recommendations and reversible performance modes. It also includes an optional AI assistant (NVIDIA NIM) to help you understand your system.

**Download:** [NitroFlow for Windows — latest release](https://github.com/Pausiar/NitroFlow/releases/latest) · **Version 1.3.0**

---

## Cómo usarlo (3 pasos)

1. **Download and install** NitroFlow from the [latest release](https://github.com/Pausiar/NitroFlow/releases/latest), then open it. The welcome guide explains the basics the first time.
2. **Press «Analizar mi PC»** on the Panel. NitroFlow gives your PC a health score from 0 to 100 and lists what could be improved, in plain language.
3. **Press «Optimizar ahora»**. Review the list first: NitroFlow creates a Windows restore point (if enabled), then applies only the fixes you selected. Your documents, photos and personal files are never deleted, and anything reversible can be undone from **Historial**.

Simple mode is the default. Expert tools (**Procesos** and **Registro**) appear only when you turn on **Modo avanzado** in **Ajustes**.

---

## Features

### ✨ One-Click Optimization (Panel)
- Health check with a 0–100 score and a short list of issues, each explained in plain language
- **«Analizar mi PC»** scans your system; **«Optimizar ahora»** applies the fixes you selected
- Covers temporary files, startup programs, the power plan and the recycle bin (the bin is only emptied when you choose it)

### 🧹 Safe Cleanup (Limpieza)
- **Recommended** (safe to clean): temporary files older than 24 hours (Windows + user), Windows Update download cache, Delivery Optimization cache, thumbnail cache, error reports, crash dumps, shader cache, and browser caches for Chrome, Edge, Brave and Firefox
- **Optional** (with warnings): Recycle Bin, Prefetch, Recent files list and old event logs
- Browser cleanup only touches cache folders — never passwords, history or cookies

### 🚀 Startup Programs (Programas de inicio)
- Every startup program is labeled with a plain-language recommendation: **Recomendado desactivar**, **Mantener** or **Opcional**, with the reason explained
- Essential items such as antivirus and hardware drivers are protected and cannot be disabled
- **«Desactivar recomendados»** turns off the recommended entries in one click; each change can be undone from Historial
- Each entry also shows its estimated startup impact (High / Medium / Low)

### ⚡ Performance Modes (Rendimiento)
- **Equilibrado** — the default day-to-day mode; restores your original settings exactly
- **Rendimiento** — uses Windows' High performance power plan for heavy work (video editing, rendering, programming)
- **Juegos** — everything in Rendimiento plus Windows Game Mode and game-priority settings
- Your original settings are saved before any change, and switching back to Equilibrado restores them. Laptop-aware: the always-full-speed processor setting is only applied on desktop PCs
- Errors are reported honestly (for example, when administrator rights are needed)

### 📊 Performance Dashboard
- Real-time CPU, RAM, and Disk metrics
- Historical usage charts (last 60 data points)
- Disk space visualization

### 🛠️ Expert Tools (Modo avanzado)
- **Procesos**: real-time process list with CPU/RAM usage, safe process termination (system processes are protected), and Windows service control
- **Registro**: scan for orphaned entries from uninstalled software and invalid startup entries, with an automatic backup before any change

### 🤖 AI Assistant (NVIDIA NIM)
- Powered by Meta Llama 3, Mistral, or NVIDIA Nemotron via [build.nvidia.com](https://build.nvidia.com)
- Receives full system context (metrics, processes, recent actions)
- Answers natural-language questions about your system
- Provides personalized optimization recommendations
- Works in offline mode without an API key

### 🕘 Restore Points and History
- Automatic Windows restore point before important changes (skipped if one was created in the last 24 hours; can be turned off in **Ajustes**)
- **Historial** lists your actions and lets you undo the reversible ones

---

## Architecture

```
NitroFlow/
├── src/
│   ├── main/                 # Electron main process (Node.js)
│   │   ├── index.ts          # App entry point
│   │   ├── ipc/              # IPC channel handlers
│   │   ├── services/         # Core services
│   │   │   ├── system-monitor.ts   # WMI/PowerShell metrics
│   │   │   ├── health.ts           # One-click health check and optimization
│   │   │   ├── cleanup.ts          # Safe file cleanup (recommended / optional)
│   │   │   ├── optimizer.ts        # Reversible performance modes
│   │   │   ├── restore-point.ts    # Windows restore points
│   │   │   ├── registry.ts         # Registry operations
│   │   │   ├── process-manager.ts  # Process/service control
│   │   │   ├── startup-manager.ts  # Startup entries
│   │   │   ├── startup-knowledge.ts # Plain-language startup recommendations
│   │   │   ├── ai-service.ts       # NVIDIA NIM integration
│   │   │   ├── history.ts          # Action history & undo
│   │   │   └── settings.ts         # App settings
│   │   └── utils/
│   │       ├── security.ts         # Path/registry/process protection, AI anonymization
│   │       ├── powershell.ts       # PowerShell runner
│   │       ├── ps-errors.ts        # Friendly PowerShell error messages
│   │       └── settings-validation.ts  # Whitelist for settings coming from the UI
│   ├── preload/              # Context bridge (IPC exposure)
│   ├── renderer/             # React frontend
│   │   └── src/
│   │       ├── components/   # UI components per module
│   │       ├── store/        # Zustand state management
│   │       └── styles/       # Tailwind CSS (Fluent Design)
│   └── shared/               # Shared TypeScript types
├── tests/                    # Jest unit tests
└── resources/                # App icons
```

**Tech stack:** Electron · React · TypeScript · Vite · Tailwind CSS · Zustand · Recharts · NVIDIA NIM API

---

## Security

NitroFlow is built with a safety-first approach:

- **Restore points**: Before important changes NitroFlow asks Windows for a System Restore point, so system settings can be rolled back from Windows' own "Restaurar sistema". It never turns System Restore on by itself, and it can be disabled in **Ajustes**
- **Safe cleanup rules**: Only temporary files older than 24 hours are removed, and only from known cache and temp locations. Browser cleanup is limited to cache folders (never passwords, history or cookies). Optional categories (Recycle Bin, Prefetch, Recent files, event logs) are never selected by default and carry a warning
- **Startup protection**: Essential startup items (security software and hardware drivers) are protected and cannot be disabled, enforced in the main process and not only in the UI. Every startup change is recorded so it can be undone
- **Reversible performance modes**: NitroFlow saves your original settings before switching modes, and Equilibrado restores them exactly. Only a fixed list of registry values can be touched, and restores only use those paths
- **Protected paths**: System32, SysWOW64, WinSxS, user Documents/Pictures/Music/Videos are never touched
- **Protected registry keys**: SYSTEM, SAM, Security, Winlogon, Policies keys are read-only
- **Protected processes**: Critical OS processes (lsass, csrss, winlogon, svchost, etc.) cannot be terminated; matching ignores the `.exe` suffix because Windows reports names without it
- **Protected services**: Critical services (Defender, Windows Update, RPC, Event Log, ...) cannot be stopped or disabled, enforced in the main process and not only in the UI
- **Registry backups**: Only the keys about to be modified are exported (one `.reg` per key, in `~/NitroFlow/registry-backups/backup-<timestamp>/`). If the backup fails, nothing is changed
- **Real results**: Operations report PowerShell failures (for example "access denied, run as administrator") instead of claiming success
- **Undo**: Registry cleanups, startup toggles, service start/stop and performance modes can be reverted from the History page. Deleted temporary files cannot be restored, which is why cleanup only removes files that Windows or the applications regenerate
- **User confirmation**: Required before every irreversible action
- **AI never executes**: The AI module only analyzes and recommends — the user approves each action
- **Data anonymization**: Personal paths, usernames, computer names, IPs, and MAC addresses are stripped from every message before it is sent to NVIDIA NIM

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+
- Windows 10/11 (for full functionality; runs in demo mode on other platforms)

### Install & Run

```bash
npm install
npm run dev          # Development mode with hot reload
```

### Build

```bash
npm run build        # Build for production
npm run package      # Create Windows installer (.exe)
```

### Test

```bash
npm test             # Run unit tests
npm run test:coverage  # With coverage report
```

---

## AI Configuration

1. Get a free API key at [build.nvidia.com](https://build.nvidia.com)
2. Open NitroFlow → **Ajustes** (Settings)
3. Paste your `nvapi-…` key in the "API Key de NVIDIA NIM" field
4. Select your preferred model (Llama 3, Mistral, Nemotron)
5. Click **Guardar configuración**

The app works in offline mode without an API key — you'll still get basic analysis based on the metrics.

---

## Performance Modes

| Mode | Description |
|------|-------------|
| **Equilibrado** (Balanced) | Default. Restores your original Windows settings exactly; best for everyday use, browsing and laptops on battery |
| **Rendimiento** (Performance) | Uses Windows' "Alto rendimiento" power plan (your own plan is not changed) and fewer visual effects; best for heavy work. Uses more power and may be louder |
| **Juegos** (Gaming) | Everything in Rendimiento, plus Windows Game Mode and game-priority settings. Gains are most noticeable on modest hardware |

Switch modes from **Rendimiento** in the sidebar. Switching back to **Equilibrado** undoes all of them.
