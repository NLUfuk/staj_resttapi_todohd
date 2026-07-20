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

## Genişleme: Şirket İçi Platform (Geliştirme Yol Haritası)

Kaynak: `GELIŞTİRME_YOL_HARİTASI.md` (departman tabanlı todo+helpdesk+chat platformuna dönüşüm). Bu bölümün faz numaralandırması yukarıdaki "Faz 1-5" ile bağımsızdır (0'dan başlar, yeni genişleme fazlarını ifade eder).

| Faz | İçerik | Durum |
|---|---|---|
| Faz 0 | Güvenlik temeli (rate limit + helmet + CORS) | ✅ |
| Faz 1 | Departman modülü | ✅ |
| Faz 2 | Todo geliştirmeleri (sayfalama + due_date + priority) | ✅ |
| Faz 3 | Ticket yorumları | ✅ |
| Faz 4 | Şirket chat'i (departman kanalları) | ✅ |
| Faz 5 | Bildirimler + aktivite logu | ✅ |
| Faz 6 | Yetki modeli + refresh token + istatistik | ✅ |

### Genişleme Faz 0 — Güvenlik Temeli ✅

- [x] `express-rate-limit` + `helmet` eklendi (`backend/package.json`)
- [x] `helmet()` global middleware olarak uygulandı (HSTS, nosniff, frameguard vb.) — `backend/src/app.js`
- [x] `/api-docs` için CSP gevşetildi (`helmet({ contentSecurityPolicy: false })`), Swagger UI bundle'ının inline script/style kullanımı nedeniyle; diğer tüm rotalarda varsayılan sıkı CSP korunuyor
- [x] CORS artık argümansız değil — izinli origin listesi `backend/src/config.js` içinde (`CORS_ORIGINS` env ile override edilebilir), varsayılan: `http://localhost:5500` (README'deki `http-server -p 5500` akışı) + `http://localhost:5173` (Vite)
- [x] Global limiter: `/api` altında IP başına 15 dakikada 300 istek (test ortamında pratik olarak sınırsız — mevcut test paketinin 429'a takılmaması için)
- [x] Login limiter: `/api/auth/login` için IP başına 15 dakikada 10 deneme, test ortamında da aynı (brute-force testinin anlamlı olması için gevşetilmedi)
- [x] `backend/tests/security.test.js` — 4 yeni test: HSTS/nosniff header varlığı, izinsiz origin'de CORS header'ı yokluğu, izinli origin'de header varlığı, 11. login denemesinde 429 + RateLimit-*/Retry-After header'ları
- [x] `npm test` → 5 suite, 38/38 geçti (regresyon yok)

### Genişleme Faz 1 — Departman Modülü ✅

- [x] Şema: `departments` tablosu (`backend/src/db.js`), `users.department_id` / `tickets.department_id` kolonları `PRAGMA table_info` ile idempotent `ALTER TABLE ... ADD COLUMN` ile eklendi (proje migration aracı kullanmıyor, `db.js` her başlangıçta güvenle tekrar çalışır)
- [x] 4 departman seed edildi (Donanım/donanim, Yazılım/yazilim, Muhasebe/muhasebe, Genel/genel); var olan kullanıcı/ticket satırları (department_id NULL olanlar) otomatik olarak Genel'e atandı — geriye dönük kırmıyor
- [x] Yeni kayıt olan kullanıcılar varsayılan olarak Genel departmanına atanıyor (`backend/src/routes/auth.routes.js`)
- [x] `backend/src/routes/departments.routes.js` — `GET /api/departments` (auth), `POST/PATCH/DELETE /api/departments(/:id)` (admin). Slug, isimden Türkçe karakter dönüşümüyle otomatik türetiliyor (`İ/I → i` özel eşlemesi dahil — JS'in locale-unaware `toLowerCase()`'i "İ"yi "i" + birleşik nokta işaretine çeviriyor, bu düzeltilmeden slug bozuluyordu)
- [x] Departman silme: üye (`users.department_id`) veya talebi (`tickets.department_id`) olan departman 409 ile reddediliyor
- [x] `PATCH /api/admin/users/:id` artık `department_id` alanını da kabul ediyor (role ve/veya department_id, en az biri zorunlu)
- [x] `POST /api/tickets` artık `department_id` zorunlu alanı istiyor (400 döner eksikse/geçersizse) — talebin hangi departmana yönlendirildiğini belirtir, raporlayan kullanıcının kendi departmanından bağımsız
- [x] `GET /api/admin/tickets?department=<slug>` filtresi eklendi (bilinmeyen slug → 400)
- [x] `backend/src/seed.js` güncellendi: alice → Donanım, bob → Muhasebe, admin → Genel; ticket örnekleri kendi departmanlarına bağlandı
- [x] `backend/src/openapi.js` güncellendi: `Department` şeması, `/api/departments` + `/api/departments/{id}` path'leri, `department_id` alanları (User/Ticket şemaları), `department` query parametresi
- [x] Mevcut testler (`tickets.test.js`, `admin.test.js`) yeni zorunlu `department_id` alanına uyarlandı; `backend/tests/departments.test.js` — 11 yeni test (CRUD, yetkilendirme, 409 üye/talep koruması, kullanıcı atama, ticket departman filtresi)
- [x] `npm test` → 6 suite, 53/53 geçti; `npm run seed` gerçek `data.sqlite` üzerinde hatasız çalıştı

### Genişleme Faz 2 — Todo Geliştirmeleri (sayfalama + due_date + priority) ✅

- [x] Şema: `todos.due_date` (TEXT, nullable) ve `todos.priority` (TEXT, `CHECK IN ('low','medium','high')`, `DEFAULT 'medium'`) — `ADD COLUMN` ile CHECK+DEFAULT birlikte doğrulandı (SQLite'ın buna izin verdiği manuel test edildi)
- [x] `backend/src/utils/pagination.js` — ortak `parsePagination` (limit üst sınırı 100, geçersiz/eksik değerler güvenli varsayılana düşer) ve RFC 5988 `Link` header üretici (`first`/`prev`/`next`/`last`), `X-Total-Count` header'ı
- [x] Sayfalama uygulanan uçlar: `GET /api/todos`, `GET /api/tickets`, `GET /api/admin/users`, `GET /api/admin/todos`, `GET /api/admin/tickets` (departman filtresiyle birlikte çalışıyor)
- [x] `GET /api/todos` — `?status=&priority=&sort=&order=` filtre+sıralama; `sort` alanı sabit bir whitelist'ten geliyor (SQL injection'a kapalı, doğrudan string interpolation güvenli)
- [x] `POST/PUT /api/todos` — `due_date` (ISO 8601, `Date.parse` ile doğrulanıyor) ve `priority` alanlarını kabul ediyor
- [x] `backend/src/openapi.js` güncellendi: Todo şemasına `due_date`/`priority`, tüm liste uçlarına pagination query parametreleri + `X-Total-Count`/`Link` response header dokümantasyonu, todo filtre/sıralama parametreleri
- [x] `backend/tests/pagination.test.js` — 11 yeni test (due_date/priority doğrulama, filtre+sıralama, `X-Total-Count`/`Link` header'ları — first/last/next/prev senaryoları, limit üst sınırı, admin/ticket uçlarında sayfalama)
- [x] `npm test` → 7 suite, 64/64 geçti; `npm run seed` gerçek `data.sqlite` üzerinde hatasız çalıştı

### Genişleme Faz 3 — Ticket Yorumları ✅

- [x] Şema: `ticket_comments` tablosu (`ticket_id` → `tickets` ON DELETE CASCADE, `user_id` → `users`, `body`, `created_at`) — `backend/src/db.js`
- [x] `backend/src/routes/tickets.routes.js` içine nested route'lar eklendi: `GET/POST /api/tickets/:id/comments`, `DELETE /api/tickets/:id/comments/:cid`. Bu, `/api/tickets/*` altında admin'in kendi sahibi olmadığı bir ticket'a erişebildiği tek yer olduğu için, blanket `WHERE user_id = ?` yerine `findTicketForRequester()` ile manuel sahiplik-veya-admin kontrolü yapılıyor
- [x] Sahiplik izolasyonu: talebe erişimi olmayan kullanıcı için hem GET hem POST hem DELETE 404 döner (var olup olmadığını sızdırmıyor)
- [x] Kapalı (`closed`) talebe yeni yorum eklenemez → 409
- [x] Yorum silme: yazan kullanıcı veya admin → 204; talebe erişimi olan ama yorumun sahibi olmayan/admin olmayan kullanıcı (örn. kendi talebindeki admin yorumunu silmeye çalışan raportör) → 403
- [x] `admin_response` alanı korunuyor (geriye dönük uyumluluk), `backend/src/openapi.js`'te `deprecated: true` işaretlendi ve yerine yorum akışının kullanılması gerektiği açıklandı
- [x] `backend/src/openapi.js` güncellendi: `TicketComment` şeması, `/api/tickets/{id}/comments` ve `/api/tickets/{id}/comments/{cid}` path'leri (sayfalama + 403/404/409 response'ları dahil)
- [x] `backend/tests/ticketComments.test.js` — 10 yeni test (CRUD, admin-veya-sahibi erişimi, sahiplik izolasyonu, closed 409, silme yetkilendirmesi — yazan/admin/403 senaryosu dahil)
- [x] `npm test` → 8 suite, 74/74 geçti; `npm run seed` gerçek `data.sqlite` üzerinde hatasız çalıştı

### Genişleme Faz 4 — Şirket Chat'i (departman kanalları) ✅

- [x] Şema: `channels` (`department_id` NULL = herkese açık `#genel`), `messages` (`channel_id` → `channels` CASCADE, `user_id` → `users`), `idx_messages_channel_created` indexi — `backend/src/db.js`
- [x] **Teknik borç düzeltmesi (Faz 3'ten kalma):** `ticket_comments.user_id` ve yeni `messages.user_id` başlangıçta `ON DELETE CASCADE` içermiyordu; bir kullanıcı silinirken yorum/mesaj bırakmışsa ham `FOREIGN KEY constraint failed` (500) hatası verirdi. `db.js`'e `ensureTableSchema()` eklendi — SQLite bir FK'nin `ON DELETE` aksiyonunu yerinde ALTER edemediği için, mevcut tabloyu (varsa) veriyi koruyarak yeniden oluşturuyor. Gerçek `data.sqlite` üzerinde doğrulandı (`PRAGMA foreign_key_list` artık her iki tabloda da `on_delete: CASCADE` gösteriyor)
- [x] 4 kanal seed edildi: departman başına bir kanal (`donanim`/`yazilim`/`muhasebe`, ilgili departmana bağlı) + herkese açık `genel` kanalı (`department_id = NULL`). Not: bu "genel" kanal, "Genel" departmanından (departments tablosundaki catch-all) kavramsal olarak ayrı — departmanı Genel olan bir kullanıcı için de sadece bu herkese-açık kanal görünür, ayrı bir departman kanalı yok
- [x] `backend/src/routes/channels.routes.js` — `GET /api/channels` (erişilebilir kanallar: admin hepsi, kullanıcı kendi departmanı + #genel), `GET/POST /api/channels/:id/messages`, `DELETE /api/channels/:id/messages/:mid`
- [x] Erişim kontrolü: departman kanalına erişimi olmayan kullanıcı 403 alır (ticket yorumlarındaki 404-ile-gizleme modelinden farklı olarak, roadmap'in açık talebi üzerine 403 kullanıldı); var olmayan kanal 404
- [x] Mesaj listesi **cursor tabanlı** sayfalama kullanıyor (klasik page/limit değil): `?before=<id>` eski mesajları, `?after=<id>` polling için yeni mesajları getirir; ikisi de yoksa en son `limit` mesaj kronolojik sırada dönülür. Yeni mesaj eklenmesi daha önce alınmış bir `before` cursor'ının sonucunu kaydırmıyor (test edildi)
- [x] Mesaj gönderimi: kullanıcı bazlı (IP değil) rate limiter, dakikada 30 mesaj — `keyGenerator: req.user.id`; aşılırsa 429
- [x] Mesaj silme: yazan veya admin → 204; diğerleri 403
- [x] Gerçek zamanlılık: bu fazda sadece Adım 1 (polling, `?after=`) uygulandı; SSE/Socket.IO roadmap'te sonraki adımlar olarak bırakıldı, bu fazın kabul kriterlerinde yok
- [x] `backend/src/openapi.js` güncellendi: `Channel`/`Message` şemaları, `/api/channels`, `/api/channels/{id}/messages`, `/api/channels/{id}/messages/{mid}` path'leri
- [x] `backend/tests/channels.test.js` — 15 test (erişim listesi, 403/404 erişim kontrolü, mesaj CRUD + yetkilendirme, cursor tutarlılığı, polling). `backend/tests/channels.flood.test.js` — flood testi ayrı dosyada izole edildi (rate limiter'ın process-ömürlü bellek içi store'u, `resetDb()`'nin `sqlite_sequence`'i sıfırlamasıyla testler arası user-id yeniden kullanımından kirleniyordu; ayrı dosya = ayrı Jest modül kaydı = temiz limiter store)
- [x] `npm test` → 10 suite, 88/88 geçti; `npm run seed` + FK-cascade migration gerçek `data.sqlite` üzerinde doğrulandı

### Genişleme Faz 5 — Bildirimler + Aktivite Logu ✅

- [x] Şema: `notifications` (`user_id` → `users` CASCADE, `type`, `ref_id`, `body`, `read_at` NULL=okunmadı) + `idx_notifications_user_read`; `audit_logs` (`user_id` → `users` **ON DELETE SET NULL** — aktör silinse bile denetim kaydı kaybolmaz, sadece kim yaptığı bilgisi anonimleşir)
- [x] `backend/src/utils/notify.js` — `notify()` yardımcı fonksiyonu + `notifyMentions()` (mesaj gövdesinden `@kullanici` regex'i ile mention çıkarır, gönderenin kendini mention etmesini ve var olmayan kullanıcı adlarını sessizce yok sayar)
- [x] `backend/src/utils/audit.js` — `audit()` yardımcı fonksiyonu, sadece yazma-kritik işlemlerde çağrılıyor
- [x] Tetikleyiciler bağlandı:
  - Ticket'a yorum eklenince (admin yorumu) → raportöre `ticket_comment` bildirimi (raportörün kendi yorumu bildirim üretmiyor, çünkü tek bir "atanmış admin" kavramı yok)
  - Ticket durumu değişince → raportöre `ticket_status` bildirimi; durum `closed` olursa ayrıca `ticket.close` audit kaydı
  - Chat mesajında `@kullanici` → mention edilen kullanıcıya `mention` bildirimi
  - Kullanıcı silme → `user.delete`; rol değişimi (gerçekten değiştiyse) → `role.change`; todo/ticket/departman silme (admin) → `todo.delete`/`ticket.delete`/`department.delete`
- [x] `backend/src/routes/notifications.routes.js` — `GET /api/notifications?unread=true` (sayfalı), `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all` (hepsi sahiplik izolasyonlu — başkasının bildirimini okundu işaretlemek 404)
- [x] `GET /api/admin/audit-logs` (admin, sayfalı, `LEFT JOIN users` ile `actor_username` — aktör silinmişse NULL) — `backend/src/routes/admin.routes.js`
- [x] `backend/src/openapi.js` güncellendi: `Notification`/`AuditLog` şemaları, `/api/notifications`, `/api/notifications/read-all`, `/api/notifications/{id}/read`, `/api/admin/audit-logs` path'leri
- [x] `backend/tests/notifications.test.js` — 10 test (yorum/durum/mention tetikleyicileri, kendi-kendine mention/var-olmayan-kullanıcı sessizce yok sayılıyor, unread filtresi, tekil/toplu okundu işaretleme, sahiplik izolasyonu). `backend/tests/auditLogs.test.js` — 7 test (yetkilendirme, her tetikleyici türü, no-op rol değişimi loglanmıyor, sayfalama)
- [x] **Test altyapısı düzeltmesi:** `tests/helpers.js`'teki `resetDb()` artık `notifications` ve `audit_logs` tablolarını da temizliyor — daha önce hiçbir cascade bu tabloları temizlemiyordu, bu yüzden aynı dosyadaki testler arası veri sızıyordu (audit log testlerinde tespit edildi ve düzeltildi)
- [x] `npm test` → 12 suite, 105/105 geçti; `npm run seed` gerçek `data.sqlite` üzerinde hatasız çalıştı

### Genişleme Faz 6 — Yetki Modeli + Refresh Token + İstatistik ✅

- [x] `users.role` CHECK kısıtı `'user'|'dept_lead'|'admin'` olacak şekilde genişletildi. SQLite bir CHECK'i yerinde ALTER edemediği için tablo yeniden inşa edildi; `users` tablosuna birçok başka tablodan gelen FK referansı olduğu için düz bir `RENAME TO` bu referansları `users_old`'a kaydırırdı — `PRAGMA legacy_alter_table = ON` ile bu davranış kapatılıp diğer tabloların FK'ları isim üzerinden yeniden "users"a bağlanacak şekilde korundu (scratchpad'te ayrı bir script ile doğrulandı, sonra gerçek `data.sqlite` üzerinde `PRAGMA foreign_key_list` ile teyit edildi)
- [x] `middleware/auth.js`: `requireRole(role)` → `requireRole(...roles)` (çoklu rol desteği, geriye dönük uyumlu)
- [x] `backend/src/utils/departmentAccess.js` — `getUserDepartmentId()` ortak yardımcı fonksiyonu (JWT payload'ı department taşımıyor, her zaman DB'den taze okunuyor); `channels.routes.js` ve `tickets.routes.js` bunu kullanacak şekilde refactor edildi (DRY)
- [x] `backend/src/routes/admin.routes.js` yeniden yapılandırıldı: blanket `requireRole('admin')` kaldırıldı, route bazlı yetkilendirmeye geçildi — kullanıcı/todo/audit-log yönetimi hâlâ sadece admin; ticket GET/PATCH `requireRole('admin','dept_lead')` + `canManageTicket()` ile departman eşleşmesi kontrolü (dept_lead sadece kendi departmanının taleplerini görür/günceller); ticket DELETE admin-only kaldı (dept_lead kapsamı sadece "durum değiştirme, yanıtlama")
- [x] `GET /api/admin/tickets?department=` filtresi dept_lead için kendi departmanına zorlanıyor (farklı bir departman istenirse 403)
- [x] `tickets.routes.js`'teki `findTicketForRequester()` (yorum uçları) dept_lead'i de kapsayacak şekilde genişletildi — kendi departmanındaki taleplere yorum yazabiliyor ("yanıtlama" ihtiyacı `admin_response` yerine Faz 3'ün yorum akışıyla karşılanıyor)
- [x] Refresh token: `refresh_tokens` tablosu (`token_hash` UNIQUE, `expires_at`, `revoked_at`). `backend/src/utils/refreshToken.js` — opaque token (crypto.randomBytes), DB'de sadece SHA-256 hash'i saklanıyor (şifre değil, yüksek entropili token olduğu için bcrypt yerine hızlı hash yeterli ve doğru tercih)
- [x] Access token ömrü 2 saatten **15 dakikaya** düşürüldü (`backend/src/config.js`); refresh token 30 gün, DB'de saklandığı için anında iptal edilebiliyor — rapordaki JWT (stateless, access) vs opaque (stateful, revocable, refresh) karşılaştırmasının uygulaması
- [x] `POST /api/auth/register` ve `POST /api/auth/login` artık `refreshToken` alanını da dönüyor; `POST /api/auth/refresh` (rotasyonlu: eski token iptal edilip yenisi verilir), `POST /api/auth/logout` (idempotent iptal) eklendi
- [x] `GET /api/admin/stats` (admin-only, dept_lead dahil değil): departman bazında open/in_progress/closed ticket sayısı, ortalama kapanma süresi (`julianday` farkı, kapatılmış ticket yoksa `null`), kullanıcı başına todo sayısı, son 7 gün kanal bazlı + toplam mesaj hacmi
- [x] `backend/src/openapi.js` güncellendi: `Stats` şeması, `role` enum'ları `dept_lead` içerecek şekilde güncellendi, `AuthResponse`'a `refreshToken`, `/api/auth/refresh`, `/api/auth/logout`, `/api/admin/stats` path'leri, dept_lead erişim notları
- [x] `backend/tests/deptLead.test.js` (9 test — kapsam izolasyonu, 403 senaryoları, admin-only uçlardan men, yorum yazabilme), `backend/tests/refreshToken.test.js` (7 test — issuance, rotasyon, eski token'ın geçersizleşmesi, logout idempotency), `backend/tests/stats.test.js` (4 test — yetkilendirme, agregasyon doğruluğu, boş veri edge case)
- [x] `npm test` → 15 suite, 126/126 geçti
- [x] Uçtan uca doğrulama: `npm run seed` gerçek `data.sqlite` üzerinde çalıştırıldı; geçici bir sunucu instance'ı (port 3099, kullanıcının kendi çalışan dev sunucusuna dokunulmadan) ile gerçek HTTP üzerinden login → refresh token exchange → departments → channels → admin/stats → `/api-docs` (200) doğrulandı, sonra o geçici süreç temizlendi

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
| ~~4~~ | ~~Rate limiting / brute-force koruması yok~~ — Genişleme Faz 0'da eklendi (helmet + global/login rate limiter) | Kapandı |
| 5 | Şirket chat'i şu an sadece polling (`?after=`) ile gerçek zamanlı; SSE/Socket.IO roadmap'te sonraki adım olarak bırakıldı (bu fazın kabul kriterlerinde değildi) | Orta |
| 6 | Chat mesajları ve ticket yorumları için soft delete (`deleted_at`) yok — silme kalıcı; roadmap'in "Mimari Notlar" bölümü ileride bunu öneriyor, audit log ile tutarlılık için düşünülebilir | Düşük |
| 7 | `data.sqlite` tek dosya/tek yazar modeli sürüyor — chat hacmi ciddi büyürse roadmap'in önerdiği gibi PostgreSQL'e geçiş gerekebilir | Düşük (şu ölçekte sorun değil) |

## Nasıl Çalıştırılır

Bkz. `README.md`.
