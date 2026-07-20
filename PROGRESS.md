# PROGRESS

Son güncelleme: 2026-07-20

## Durum Özeti

| Faz | Durum |
|---|---|
| Faz 1 — Backend REST API | ✅ |
| Faz 2 — Seed + Testler | ✅ |
| Faz 3 — Frontend (vanilla JS) | ✅ |
| Faz 4 — Uçtan uca doğrulama | ✅ |
| Faz 5 — Swagger UI (API dokümantasyonu) | ✅ |

## Ortam Gereksinimleri

- Node.js (test edilen sürüm: v20.19.4) + npm
- Ek credential/servis gerekmiyor. JWT secret `.env` ile override edilebilir (`JWT_SECRET`), yoksa `backend/src/config.js` içindeki dev fallback kullanılır — **prod'a taşınırsa mutlaka gerçek bir secret set edilmeli**.
- Veritabanı: `better-sqlite3`, dosya tabanlı (`backend/data.sqlite`), migration aracı yok — şema `backend/src/db.js` içinde `CREATE TABLE IF NOT EXISTS` ile tanımlı.

### Faz 1 — Backend REST API ✅

- [x] Express app + route ayrımı (`app.js` / `server.js`, test edilebilirlik için ayrıldı)
- [x] SQLite şeması: `users`, `todos`, `tickets` (`backend/src/db.js`)
- [x] JWT auth middleware (`requireAuth`, `requireRole`) — `backend/src/middleware/auth.js`
- [x] `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- [x] `/api/todos` CRUD — kullanıcıya özel (sahiplik izolasyonu)
- [x] `/api/tickets` CRUD — kullanıcıya özel, opsiyonel `todo_id` ile todo'ya bağlanabilir, sadece `open` durumdayken düzenlenebilir
- [x] `/api/admin/users` — listele, rol değiştir (PATCH), sil
- [x] `/api/admin/todos` — tüm kullanıcıların todo'larını listele/sil (moderasyon)
- [x] `/api/admin/tickets` — tüm talepleri listele, durum + admin_response güncelle (PATCH), sil
- [x] Merkezi 404 + hata handler (`app.js`)

### Faz 5 — Swagger UI (API dokümantasyonu) ✅

- [x] `swagger-ui-express` eklendi, spec elle `backend/src/openapi.js` içinde statik OpenAPI 3.0 objesi olarak tanımlandı (14 path, 7 şema)
- [x] `/api-docs` altında mount edildi (`app.js`) — "Try it out" ile korumalı uçlar için Authorize (Bearer JWT) desteği var
- [x] `npm test` swagger eklenmesinden sonra tekrar çalıştırıldı, 34/34 geçti (regresyon yok)
- [x] `curl` ile `/api-docs/` ve `/api-docs/swagger-ui-bundle.js` 200 döndüğü doğrulandı
- [ ] Yeni bir route eklenirse `openapi.js` elle güncellenmeli — otomatik senkron değil (JSDoc/swagger-jsdoc kullanılmadı, tek dosyada tutmak basitlik için tercih edildi)

### Faz 2 — Seed + Testler ✅

- [x] `backend/src/seed.js` — admin/alice/bob kullanıcıları, örnek todo ve ticket kayıtları (tekrar çalıştırılabilir, tabloyu temizleyip yeniden dolduruyor)
- [x] Jest + Supertest, `NODE_ENV=test` ile in-memory SQLite kullanıyor (gerçek veriye dokunmuyor)
- [x] 34 test — auth, todos (CRUD + sahiplik izolasyonu), tickets (CRUD + durum geçişleri + todo bağlama), admin (yetkilendirme + kullanıcı/todo/ticket yönetimi)
- [x] `npm test` → 4 suite, 34/34 geçti

### Faz 3 — Frontend (vanilla JS) ✅

- [x] `index.html` — login/register (tab geçişli tek sayfa)
- [x] `dashboard.html` + `js/dashboard.js` — normal kullanıcı: todo CRUD, ticket oluşturma (todo'ya bağlayarak veya bağımsız), kendi taleplerini görüntüleme/düzenleme/silme
- [x] `admin.html` + `js/admin.js` — admin paneli: kullanıcı yönetimi (rol değiştir/sil), tüm todo'ları görüntüleme/silme, helpdesk kuyruğu (durum + yanıt güncelleme)
- [x] `js/api.js` — ortak fetch wrapper (Bearer token, hata normalizasyonu), rol bazlı yönlendirme guard'ları

### Faz 4 — Uçtan uca doğrulama ✅

- [x] `npm install` (backend) — 0 vulnerability
- [x] `npm test` — 34/34 yeşil
- [x] `npm run seed` — gerçek `data.sqlite` dosyasına veri yazıldı, doğrulandı
- [x] Backend gerçek HTTP üzerinden (`curl`) doğrulandı: login → todo oluştur/listele → ticket oluştur → admin tüm ticketları görür → normal kullanıcı admin route'una erişemez (403)
- [x] Frontend statik dosyaları `http-server` ile serve edilip tüm sayfa/asset'lerin 200 döndüğü doğrulandı
- [ ] **Gerçek tarayıcıda manuel tıklama testi yapılmadı** — bu ortamda browser automation aracı (Playwright/Puppeteer) yok. Kod incelemesiyle frontend'in çağırdığı endpoint/payload şekillerinin backend ile birebir eştiği doğrulandı, ama görsel/etkileşimsel bir doğrulama eksik. Kullanıcı tarayıcıda gezip kontrol etmeli.

## Bilinen Sorunlar / Teknik Borç

| # | Açıklama | Öncelik |
|---|---|---|
| 1 | Gerçek tarayıcıda manuel UI testi yapılmadı (bkz. Faz 4) | Orta |
| 2 | Ticket düzenleme/todo başlık düzenleme frontend'de `prompt()` ile yapılıyor — basitlik için tercih edildi, üretime taşınırsa inline form'a çevrilmeli | Düşük |
| 3 | JWT secret için `.env` yoksa dev fallback kullanılıyor — prod'da mutlaka `JWT_SECRET` set edilmeli | Yüksek (sadece prod için) |
| 4 | Rate limiting / brute-force koruması yok (login endpoint'i) — öğrenim projesi kapsamında bilinçli olarak eklenmedi | Düşük |

## Nasıl Çalıştırılır

Bkz. `README.md`.
