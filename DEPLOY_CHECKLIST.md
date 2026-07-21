# DEPLOY_CHECKLIST.md

SQLite korunur, PostgreSQL'e geçiş yok (bkz. `SPEC_ATAMA_MODULU.md` §8). `data.sqlite`
tek dosya olduğu için host'ta **kalıcı disk (volume)** şart - volume olmadan her
deploy'da veri sıfırlanır.

## Mimari: tek servis (backend frontend'i de sunuyor)

`backend/src/app.js` artık `frontend/` dizinini `express.static` ile de sunuyor
(2026-07-21). Yani deploy'da **tek bir web servisi** yeterli - ayrı bir static
site/frontend host'una gerek yok. Yerel geliştirme akışı değişmedi (README'deki
`http-server -p 5500` + backend `:3000` iki ayrı süreç olarak çalışmaya devam
ediyor); `frontend/js/api.js` ve `frontend/verify.html` hangi origin'de
çalıştığını (`window.location.port === '5500'` mi) kontrol edip ona göre mutlak
(`http://localhost:3000/api`) veya göreli (`/api`) adres kullanıyor.

## Ücretsiz deploy (Render Free Web Service)

1. GitHub'a bağlı reponun ana dalını (bu repo zaten `origin` olarak GitHub'a
   bağlı) Render'da "New Web Service" ile seç.
2. Root Directory: `backend`. Build Command: `npm install`. Start Command: `npm start`.
3. Plan: Free (kalıcı disk yok - aşağıdaki kısıtı oku).
4. Ortam değişkenlerini gir (bkz. "Gerekli ortam değişkenleri" tablosu) -
   `APP_URL` ve `CORS_ORIGINS` artık Render'ın kendi verdiği tek servis
   URL'sine (`https://<servis-adı>.onrender.com`) eşit olmalı, çünkü frontend
   de aynı origin'den sunuluyor.
5. Free planda servis 15 dk hareketsizlikte uyur, sıradaki istek onu birkaç
   saniyede uyandırır - ilk istek yavaş olabilir, bu normal.
6. **Kalıcı disk kısıtı:** Free planda disk kalıcı değil - servis yeniden
   başladığında (redeploy veya bazı durumlarda uyanma sonrası) `data.sqlite`
   sıfırlanabilir, tüm kullanıcı/todo/ticket verisi gider (şema `db.js`
   idempotent olduğu için hata vermez, sadece veri gider). Bu, arkadaş/ekip
   içi test için kabul edilebilir; gerçek/kalıcı kullanım için ücretli bir
   plana (Persistent Disk) geçilmeli.

## Kalıcı disk (volume)

- Railway: servise bir Volume ekle, mount path'i backend'in çalışma dizinine göre
  `data.sqlite`'ın oluşacağı yere ayarla (varsayılan: `backend/` içi - bkz. `backend/src/db.js`
  `path.join(__dirname, '..', 'data.sqlite')`). Pratikte en basiti: volume'u
  `/app/backend` (veya repo kökü) altına mount etmek.
- Render: bir Persistent Disk ekle, aynı şekilde `backend/` dizinine mount et.
- Volume mount edilmeden yapılan bir deploy, container yeniden oluşturulduğunda
  `data.sqlite`'ı sıfırdan başlatır (schema `db.js` idempotent olduğu için hata
  vermez ama tüm veri gider) - bu yüzden ilk canlı deploy'dan ÖNCE volume kurulu olmalı.

## Gerekli ortam değişkenleri

| Değişken | Açıklama | Zorunlu mu |
|---|---|---|
| `PORT` | Servisin dinleyeceği port | Host genelde otomatik sağlar (Railway/Render `PORT` inject eder) |
| `JWT_SECRET` | Access token imzalama anahtarı | **Evet** - `backend/src/config.js`'teki dev fallback (`dev-secret-change-me`) prod'da KULLANILMAMALI |
| `CORS_ORIGINS` | Frontend'in servis edildiği origin(ler), virgülle ayrılmış | Evet, aksi halde varsayılan `localhost:5500,localhost:5173` kullanılır ve canlı frontend engellenir |
| `MAIL_DRIVER` | `console` (varsayılan, dev), `resend` veya `gmail` (prod) | Prod'da `resend` veya `gmail` olmalı - aksi halde onay mailleri sadece sunucu loguna yazılır, kullanıcıya ulaşmaz |
| `RESEND_API_KEY` | Resend API anahtarı | `MAIL_DRIVER=resend` iken zorunlu |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Gönderici Gmail adresi + Google Hesap → Uygulama Şifreleri'nden alınan 16 haneli şifre (2 Adımlı Doğrulama açık olmalı) | `MAIL_DRIVER=gmail` iken ikisi de zorunlu |
| `APP_URL` | Onay linklerinin işaret ettiği frontend origin'i (`utils/mailer.js` / `routes/auth.routes.js`) | Evet - yoksa link `http://localhost:5500`'e düşer, canlıda çalışmaz |
| `NODE_ENV` | `production` | Rate limit / log davranışı için |

## Deploy öncesi doğrulama

1. `npm test` (backend) yeşil.
2. `npm run seed` gerçek `data.sqlite` üzerinde hatasız çalışıyor (ilk kurulumda demo veri için opsiyonel).
3. Volume mount edilmiş ve `data.sqlite`'ın deploy'lar arası kalıcı olduğu doğrulanmış (bir deploy sonrası veri kaybolmuyor).
4. `JWT_SECRET`, `CORS_ORIGINS`, `APP_URL`, `MAIL_DRIVER`, (varsa) `RESEND_API_KEY` set edilmiş.
5. `/api/health` 200 dönüyor, `/api-docs` erişilebilir.
6. Gerçek bir kayıt + onay maili akışı prod ortamında uçtan uca denenmiş (özellikle `MAIL_DRIVER=resend` ile).

> **Not (2026-07-21):** `MAIL_DRIVER=resend` yerelde gerçek bir Resend API key'iyle uçtan uca doğrulandı - bkz. `PROGRESS.md` "Genişleme 3". Sandbox `RESEND_FROM=onboarding@resend.dev` yalnızca hesap sahibinin kendi doğrulanmış e-postasına gönderime izin veriyor; canlıya taşınırken Resend'de özel bir domain doğrulanıp `RESEND_FROM` ona göre güncellenmeli, aksi halde başka alıcılara mail gitmez. Bu kısıt canlıda hemen keşfedildiği için (bkz. "Genişleme 4") ortam `MAIL_DRIVER=gmail`'e geçirildi - domain gerektirmediğinden herhangi bir alıcıya gönderebiliyor.

## Kapsam dışı

Bu checklist yalnızca dokümantasyondur - gerçek bir Railway/Render hesabına deploy
bu ortamda yapılmadı (altyapı erişimi yok). Kullanıcı bu adımları kendi hesabında
uygulamalı.
