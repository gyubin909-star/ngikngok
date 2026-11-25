# AICHAT

Web AI assistant bertema **Glass Black Green** dengan model assistant (teks) dari Flora.ai.

## Jalankan
1. Pastikan Node.js 18+ terpasang.
2. Salin `.env.example` menjadi `.env`, lalu isi:
   - `FLORA_API_KEY`
   - `FLORA_WORKSPACE_ID` (diawali `ws_`)
3. Jalankan `npm start`, lalu buka http://localhost:3000

## Catatan
- API key hanya ada di server (`server.js`), tidak pernah dikirim ke browser.
- Endpoint: `https://app.flora.ai/api/v1` (`GET /models?type=text`, `POST /generate`, `GET /runs/{id}`).
- Flora `/generate` butuh `project_id`; server otomatis mencari/membuat project bernama "AICHAT" di workspace Anda. Jika key tidak punya izin membuat project, isi `FLORA_PROJECT_ID` di `.env`.
- Daftar model diambil langsung dari Flora, jadi selalu mengikuti katalog terbaru.

- Jawaban yang berisi kode ditampilkan dengan blok kode + tombol Salin. Kode HTML/SVG (misalnya game) otomatis punya tab Preview (iframe sandbox), Layar penuh, Unduh, dan Muat ulang.

- Tombol **＋** di kolom chat: unggah banyak file referensi sekaligus (klik, drag & drop, atau paste). File teks/kode dibaca langsung ke prompt; gambar/dokumen diunggah ke Flora Assets lalu dikirim ke model (lewat parameter input file model bila ada, atau sebagai tautan di prompt). Maks 10 file, 20 MB per file.
- PDF, Word (.docx), dan Excel diekstrak isinya langsung di browser (library dimuat dari cdnjs saat dibutuhkan) lalu dimasukkan ke prompt. Jika gagal (mis. PDF hasil scan), file diunggah dan dikirim sebagai tautan.
- Permintaan membuat gambar (mis. "buatkan gambar kucing", "buat logo kopi", atau awali dengan `/gambar`) otomatis memakai model gambar Flora dan hasilnya tampil langsung di chat. Model gambar tidak ditampilkan di sidebar. Jika ada gambar terlampir dan Anda meminta mengubahnya ("ubah jadi gaya anime"), dipilih model gambar yang menerima gambar referensi.
