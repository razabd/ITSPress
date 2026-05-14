# Production Bug Tracker

## [BUG-001] Forgot Password — Email tidak terkirim
**Status:** Open  
**Gejala:** Fitur forgot password tidak berfungsi di environment production (VPS).  
**Dugaan penyebab:**
- Port 587 (SMTP) diblokir oleh Contabo
- Gmail App Password expired atau tidak valid di environment production

**Langkah investigasi:**
1. Jalankan `nc -zv smtp.gmail.com 587` di VPS untuk cek konektivitas SMTP
2. Cek log backend saat forgot password dipanggil
3. Jika port diblokir, pertimbangkan alternatif: SMTP relay (SendGrid, Mailgun) atau port 465

---
