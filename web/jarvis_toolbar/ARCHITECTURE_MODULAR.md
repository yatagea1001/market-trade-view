# 📦 Dokumentasi Arsitektur Modular — Jarvis Toolbar v3

## 🎯 Tujuan Refactoring

File `jarvis_toolbar.js` sebelumnya 1 file 1640 baris (67KB). Setiap kali mau edit tooltip, harus scroll cari di antara 1640 baris. Setiap mau tambah tombol, harus hati-hati tidak merusak logic lain.

Sekarang dipecah jadi **15 file kecil**, masing-masing punya tanggung jawab tunggal.

---

## 📂 Struktur Folder

```
web/jarvis_toolbar/
├── config.js              ← Konstanta & pengaturan global
├── state.js               ← Shared state (semua variabel)
├── wasm-bridge.js         ← Abstraksi komunikasi C++ (WASM)
├── utils.js               ← Helper functions (flash, detectMobile)
│
├── tools/                 ← Konfigurasi tombol + event handler
│   ├── drawing-tools.js   ← Drawing toolbar (9 tombol alat gambar)
│   ├── right-bar-tools.js ← Right panel toolbar (7 toggle)
│   ├── nav-tools.js       ← Navigation toolbar (Symbol, TF, Candle, dll)
│   └── replay-tools.js    ← Replay button logic
│
├── ui/                    ← Tampilan & interaksi UI
│   ├── html-builder.js    ← HTML template generator
│   ├── css-builder.js     ← CSS stylesheet generator
│   ├── tooltip.js         ← Tooltip handler
│   ├── context-menu.js    ← Context menu (klik kanan)
│   └── scrollbar.js       ← Scrollbar overlay handler
│
├── sync/                  ← Sinkronisasi posisi & state
│   ├── position-sync.js   ← Position sync (60fps dari C++)
│   └── state-sync.js      ← State sync (polling 200ms)
│
└── index.js               ← Entry point (init + auto-start)
```

---

## 🔄 Load Order (WAJIB diikuti)

Urutan `<script>` di `app.html` **HARUS** sesuai dependency:

```
1. config.js          ← Tidak ada dependency
2. state.js           ← Tidak ada dependency
3. wasm-bridge.js     ← Baca JT.State.wasmReady
4. utils.js           ← Baca JT.Config
5. tools/*.js         ← Baca JT.State, JT.WasmBridge, JT.Utils
6. ui/*.js            ← Baca JT.DrawingTools, JT.RightBarTools, JT.NavTools
7. sync/*.js          ← Baca JT.State, JT.WasmBridge, JT.NavTools
8. index.js           ← Baca semua modul di atas
```

---

## 🏗️ Namespace Pattern

Semua modul menggunakan namespace `window.JT` (JarvisToolbar):

| Namespace | File | Fungsi |
|-----------|------|--------|
| `JT.Config` | config.js | Konstanta & pengaturan |
| `JT.State` | state.js | Shared state management |
| `JT.WasmBridge` | wasm-bridge.js | Komunikasi C++ via WASM |
| `JT.Utils` | utils.js | Helper functions |
| `JT.DrawingTools` | drawing-tools.js | Drawing toolbar logic |
| `JT.RightBarTools` | right-bar-tools.js | Right panel toolbar logic |
| `JT.NavTools` | nav-tools.js | Navigation toolbar logic |
| `JT.ReplayTools` | replay-tools.js | Replay button logic |
| `JT.HtmlBuilder` | html-builder.js | HTML template generator |
| `JT.CssBuilder` | css-builder.js | CSS stylesheet generator |
| `JT.Tooltip` | tooltip.js | Tooltip handler |
| `JT.ContextMenu` | context-menu.js | Context menu handler |
| `JT.Scrollbar` | scrollbar.js | Scrollbar overlay handler |
| `JT.PositionSync` | position-sync.js | Position sync (60fps) |
| `JT.StateSync` | state-sync.js | State sync (polling) |
| `JT.App` | index.js | Entry point & init |

---

## 🎯 Panduan Tambah Fitur Baru

### Skenario 1: Tambah Tombol Drawing Baru

1. Edit `tools/drawing-tools.js` → tambah objek di array `TOOLS`
2. Tambah case di `handleDrawingClick()`
3. Selesai — tidak perlu edit file lain

### Skenario 2: Tambah Panel Toggle Baru

1. Edit `tools/right-bar-tools.js` → tambah objek di array `TOOLS`
2. Edit `state.js` → tambah key di `panelState`
3. Edit `sync/state-sync.js` → tambah mapping di `syncPanelStates()`
4. Selesai — tidak perlu edit file lain

### Skenario 3: Tambah Nav Button Baru

1. Edit `tools/nav-tools.js` → tambah objek di array `TOOLS`
2. Tambah case di `bind()` (kalau special handling)
3. Selesai — tidak perlu edit file lain

### Skenario 4: Tambah Frame ImGui Baru (C++ ↔ JS)

1. Edit `sync/position-sync.js` → tambah `syncOneFrame()` call di `syncPosition()`
2. Edit `ui/html-builder.js` → tambah HTML container di `buildOverlay()`
3. Edit `state.js` → tambah DOM reference
4. Edit `index.js` → cache DOM reference di `init()`
5. Build WASM + test

### Skenario 5: Ganti Warna Tema

1. Edit `config.js` → ubah `ACCENT_COLOR`, `ACCENT_RGB`, dll
2. Selesai — semua modul otomatis pakai warna baru

---

## ⚡ Debug Console

```javascript
// Lihat semua state
JarvisToolbar.state()

// Lihat internal state lengkap
JarvisToolbar._internal()

// Force re-sync
JarvisToolbar.resync()

// Toggle overlay visibility
JarvisToolbar.toggle()

// Destroy & re-init
JarvisToolbar.reinit()
```

---

## 📊 Perbandingan Sebelum vs Sesudah

| Aspek | Sebelum (1 file) | Sesudah (15 file) |
|-------|-------------------|---------------------|
| File | jarvis_toolbar.js | 15 file di 4 folder |
| Total baris | 1640 | ~1650 (sama, tapi terstruktur) |
| Edit tombol | Cari di 1640 baris | Edit 1 file (~180 baris) |
| Tambah panel | Edit 3 tempat di 1 file | Edit 3 file kecil |
| Ganti warna | Cari & replace manual | Edit config.js |
| Debug | console.log susah | JarvisToolbar.state() |
| Collision risk | Tinggi (semua di 1 scope) | Rendah (namespace per modul) |

---

## 🔧 Backup

File asli `jarvis_toolbar.js` sudah di-backup ke:
- `web/jarvis_toolbar.js.bak`

Untuk kembali ke versi lama, ganti script tags di `app.html` dengan:
```html
<script src="web/jarvis_toolbar.js.bak"></script>
```
