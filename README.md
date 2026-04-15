# NitroFlow

**Intelligent Windows System Optimizer** — Optimize your computer with 0 effort.

NitroFlow is a professional desktop application for Windows 10/11 that combines powerful system optimization tools with an AI-powered assistant (NVIDIA NIM) to help you understand and improve your system's performance — safely and intelligently.

---

## Features

### 🧹 System Cleanup
- Temporary files (Windows + user)
- Prefetch cache
- Thumbnail cache
- Windows Update download cache
- Recent files list
- Recycle Bin

### ⚙️ Process & Service Manager
- Real-time process list with CPU/RAM usage
- Kill user processes safely (system processes are protected)
- View and control Windows services

### 📝 Registry Optimizer
- Scan for orphaned entries from uninstalled software
- Detect invalid startup registry entries
- Automatic backup before any registry modification
- Protected critical keys (SYSTEM, SAM, Security, Winlogon)

### 🚀 Startup Manager
- View all startup programs (HKCU/HKLM/Startup folder)
- Enable/disable entries with one click
- Impact rating (High/Medium/Low) for each entry

### 📊 Performance Dashboard
- Real-time CPU, RAM, and Disk metrics
- Historical usage charts (last 60 data points)
- Disk space visualization

### 🤖 AI Assistant (NVIDIA NIM)
- Powered by Meta Llama 3, Mistral, or NVIDIA Nemotron via [build.nvidia.com](https://build.nvidia.com)
- Receives full system context (metrics, processes, recent actions)
- Answers natural-language questions about your system
- Provides personalized optimization recommendations
- Works in offline mode without an API key

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
│   │   │   ├── cleanup.ts          # File cleanup
│   │   │   ├── registry.ts         # Registry operations
│   │   │   ├── process-manager.ts  # Process/service control
│   │   │   ├── startup-manager.ts  # Startup entries
│   │   │   ├── ai-service.ts       # NVIDIA NIM integration
│   │   │   ├── history.ts          # Action history & undo
│   │   │   └── settings.ts         # App settings
│   │   └── utils/
│   │       └── security.ts         # Path/registry protection
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

- **Protected paths**: System32, SysWOW64, WinSxS, user Documents/Pictures/Music/Videos are never touched
- **Protected registry keys**: SYSTEM, SAM, Security, Winlogon, Policies keys are read-only
- **Protected processes**: Critical OS processes (lsass.exe, csrss.exe, winlogon.exe, etc.) cannot be terminated
- **Registry backups**: Automatic `.reg` export before any registry modification
- **User confirmation**: Required before every irreversible action
- **AI never executes**: The AI module only analyzes and recommends — the user approves each action
- **Data anonymization**: Personal paths, usernames, IPs, and MAC addresses are stripped before sending to NVIDIA NIM

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

## Optimization Profiles

| Profile | Description |
|---------|-------------|
| **Rápido** (Quick) | Basic cleanup of temp files and prefetch |
| **Profundo** (Deep) | Full scan: cleanup + registry + startup review |
| **Personalizado** (Custom) | Choose exactly what to optimize |

