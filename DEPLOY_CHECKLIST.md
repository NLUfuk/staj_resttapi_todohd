# DEPLOY_CHECKLIST.md

SQLite korunur, PostgreSQL'e geçiş yok (bkz. `SPEC_ATAMA_MODULU.md` §8). `data.sqlite`
tek dosya olduğu için host'ta **kalıcı disk (volume)** şart - volume olmadan her
deploy'da veri sıfırlanır.

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
| `MAIL_DRIVER` | `console` (varsayılan, dev) veya `resend` (prod) | Prod'da `resend` olmalı - aksi halde onay mailleri sadece sunucu loguna yazılır, kullanıcıya ulaşmaz |
| `RESEND_API_KEY` | Resend API anahtarı | `MAIL_DRIVER=resend` iken zorunlu |
| `APP_URL` | Onay linklerinin işaret ettiği frontend origin'i (`utils/mailer.js` / `routes/auth.routes.js`) | Evet - yoksa link `http://localhost:5500`'e düşer, canlıda çalışmaz |
| `NODE_ENV` | `production` | Rate limit / log davranışı için |

## Deploy öncesi doğrulama

1. `npm test` (backend) yeşil.
2. `npm run seed` gerçek `data.sqlite` üzerinde hatasız çalışıyor (ilk kurulumda demo veri için opsiyonel).
3. Volume mount edilmiş ve `data.sqlite`'ın deploy'lar arası kalıcı olduğu doğrulanmış (bir deploy sonrası veri kaybolmuyor).
4. `JWT_SECRET`, `CORS_ORIGINS`, `APP_URL`, `MAIL_DRIVER`, (varsa) `RESEND_API_KEY` set edilmiş.
5. `/api/health` 200 dönüyor, `/api-docs` erişilebilir.
6. Gerçek bir kayıt + onay maili akışı prod ortamında uçtan uca denenmiş (özellikle `MAIL_DRIVER=resend` ile).

## Kapsam dışı

Bu checklist yalnızca dokümantasyondur - gerçek bir Railway/Render hesabına deploy
bu ortamda yapılmadı (altyapı erişimi yok). Kullanıcı bu adımları kendi hesabında
uygulamalı.
