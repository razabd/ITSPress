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

## [DB-001] Kolom orphan di database setelah penghapusan fitur approval
**Status:** Open — perlu dijalankan manual di production  
**Konteks:** Kolom-kolom berikut masih ada di database tapi sudah dihapus dari model GORM:

**Tabel `users`:**
- `approval_status`
- `approval_note`
- `declaration_file_path`

**Tabel `books`:**
- `approval_status`
- `approval_note`

**Langkah perbaikan:**  
Jalankan migration berikut di PostgreSQL production:
```sql
ALTER TABLE users
  DROP COLUMN IF EXISTS approval_status,
  DROP COLUMN IF EXISTS approval_note,
  DROP COLUMN IF EXISTS declaration_file_path;

ALTER TABLE books
  DROP COLUMN IF EXISTS approval_status,
  DROP COLUMN IF EXISTS approval_note;
```

**Dampak jika dibiarkan:** Tidak ada — GORM mengabaikan kolom yang tidak ada di struct. Tidak mempengaruhi fungsionalitas apapun.

---
