# StudyNexus — Haftalık Plan Tuvali

Express 5 + EJS + SQLite tabanlı haftalık çalışma planı uygulaması. Öğrenciler A4 tuvalde sürükle-bırak plan oluşturur; öğretmenler koç kodu ile öğrencilere bağlanıp plan atar ve programlarını görüntüler.

## Özellikler

- **A4 tuval** — Ders/konu sürükle-bırak, haftalık plan kaydetme ve düzenleme
- **Plan destesi & takvim** — Kayıtlı planlar ve haftaya atama
- **Bu Hafta & İlerleme** — Öğrenci paneli (günlük özet, konu tamamlama istatistikleri)
- **Koçluk** — Öğretmen davet kodu, öğrenci bağlantısı, plan atama, öğrenci program görüntüleme
- **PDF dışa aktarma** — Tuvaldeki planın A4 PDF çıktısı
- **Auth** — Kayıt, e-posta doğrulama, şifre sıfırlama

## Kurulum

```bash
npm install
cp .env.example .env   # MAIL_USER, MAIL_PASS, SESSION_SECRET doldurun
npm run dev
```

## Teknoloji

Node.js, Express, EJS, better-sqlite3, bcrypt, nodemailer, html2canvas, jsPDF
