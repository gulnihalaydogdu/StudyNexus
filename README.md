# StudyNexus

Öğrenci ve öğretmenler için haftalık plan tuvali, günlük görevler, ilerleme takibi ve sınıf paylaşımı.

## Kurulum

```bash
npm install
cp .env.example .env
```

`.env` dosyasını düzenleyin — **MAIL_USER** ve **MAIL_PASS** zorunludur:

```env
MAIL_USER=your@gmail.com
MAIL_PASS=16_haneli_gmail_uygulama_sifresi
MAIL_FROM=StudyNexus <your@gmail.com>
SESSION_SECRET=uzun_rastgele_bir_metin
APP_URL=http://localhost:3000
```

Gmail: [Google Hesap](https://myaccount.google.com) → Güvenlik → 2 adımlı doğrulama → **Uygulama şifreleri** (normal Gmail şifresi çalışmaz).

```bash
npm run dev
```

Başarılı başlangıçta: `✉️ E-posta gönderimi aktif: your@gmail.com`

Kayıt akışı: form → doğrulama e-postası → linke tıkla → giriş.

### Mail olmadan yerel test (isteğe bağlı)

`.env` içine ekleyin: `AUTO_VERIFY_WHEN_NO_MAIL=true` — e-posta atlanır, hesap anında doğrulanır.

### `SQLITE_BUSY: database is locked`

1. Tüm `npm run dev` pencerelerini kapatın (`Ctrl+C`).
2. `rm -f studynexus.db-wal studynexus.db-shm studynexus.db-journal`
3. Tek terminalden `npm run dev`

## Özellikler

- Haftalık A4 plan, PDF, düzenleme
- Günlük görevler ve e-posta hatırlatıcıları
- İlerleme istatistikleri
- Öğretmen–öğrenci sınıfları ve plan paylaşımı
- Şifre sıfırlama
