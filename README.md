# Todo + Helpdesk REST API (öğrenim projesi)

Basit bir REST API öğrenim uygulaması: kullanıcılar kendi todo'larını yönetir, istedikleri todo'yu (veya bağımsız bir konuyu) admine helpdesk talebi olarak gönderir. Admin panelinden kullanıcılar, tüm todo'lar ve helpdesk kuyruğu yönetilir.

## Stack

- **Backend:** Node.js + Express + better-sqlite3 (dosya tabanlı SQLite), JWT auth, bcrypt şifre hash'i
- **Frontend:** Plain HTML/CSS/Vanilla JS (build aracı yok, doğrudan `fetch()` ile REST API'ye istek atar)
- **Test:** Jest + Supertest (in-memory SQLite)

## Veri Modeli

- `users`: id, username, password_hash, role (`user` | `admin`)
- `todos`: id, user_id, title, description, status (`pending` | `done`)
- `tickets`: id, user_id, todo_id (opsiyonel), subject, message, status (`open` | `in_progress` | `closed`), admin_response

## API Uç Noktaları

| Method | Path | Kim | Açıklama |
|---|---|---|---|
| POST | `/api/auth/register` | herkes | kayıt ol (role=user) |
| POST | `/api/auth/login` | herkes | giriş, JWT döner |
| GET | `/api/auth/me` | auth | kendi bilgin |
| GET/POST | `/api/todos` | auth | kendi todo'ların |
| GET/PUT/DELETE | `/api/todos/:id` | auth (sahip) | tekil todo işlemleri |
| GET/POST | `/api/tickets` | auth | kendi talepleriniz (opsiyonel `todo_id` ile bağlanır) |
| GET/PUT/DELETE | `/api/tickets/:id` | auth (sahip) | PUT sadece `open` durumda çalışır |
| GET/PATCH/DELETE | `/api/admin/users`, `/api/admin/users/:id` | admin | kullanıcı yönetimi, rol değiştirme |
| GET/DELETE | `/api/admin/todos`, `/api/admin/todos/:id` | admin | tüm todo'lar üzerinde moderasyon |
| GET/PATCH/DELETE | `/api/admin/tickets`, `/api/admin/tickets/:id` | admin | helpdesk kuyruğu, durum + yanıt güncelleme |

## Çalıştırma

### Backend

```bash
cd backend
npm install
npm run seed      # admin/alice/bob kullanıcıları + örnek veri oluşturur
npm start          # http://localhost:3000
```

### API Dokümantasyonu (Swagger UI)

Sunucu ayaktayken tarayıcıda **http://localhost:3000/api-docs** adresini aç. Tüm uç noktaları, request/response şemalarını görebilir, "Try it out" ile doğrudan tarayıcıdan istek atabilirsin.

Korumalı (auth gereken) uçları denemek için:
1. `POST /api/auth/login` bloğunu aç → "Try it out" → `{"username":"admin","password":"admin123"}` gönder → yanıttaki `token` alanını kopyala.
2. Sayfanın sağ üstündeki **Authorize** butonuna tıkla, kopyaladığın token'ı yapıştır (başına `Bearer` yazmana gerek yok, Swagger otomatik ekliyor) → Authorize → Close.
3. Artık `/api/todos`, `/api/tickets`, `/api/admin/*` gibi uçları da "Try it out" ile deneyebilirsin.

OpenAPI şeması `backend/src/openapi.js` dosyasında elle tanımlı (JSDoc yerine tek dosyada tutulan statik obje) — yeni bir route eklersen orayı da güncelle.

`npm run seed`, rol x departman kartezyeninin tamamını (admin + her departmanda bir dept_lead + her departmanda iki user), her todo status/priority kombinasyonunu, her atama (assignment) durumunu, her departman x ticket status kombinasyonunu ve her bildirim tipinden okunmuş/okunmamış birer örneği oluşturan kapsamlı bir veri seti yazar. Tam liste ve şifreler `npm run seed` çıktısında yazdırılır; başlıca hesaplar:

| Kullanıcı adı | Şifre | Rol | Departman |
|---|---|---|---|
| admin | admin123 | admin | Genel |
| lead_donanim / lead_yazilim / lead_muhasebe / lead_genel | lead123 | dept_lead | (adından belli) |
| alice | alice123 | user | Donanım |
| bob | bob123 | user | Muhasebe |
| user_donanim2, user_yazilim1/2, user_muhasebe2, user_genel1/2 | user123 | user | (adından belli) |
| pendinguser | pending123 | user | Genel — **e-postası onaysız** (`is_verified=0`), giriş yapamaz; doğrulama linki seed çıktısında yazdırılır |

### Testler

```bash
cd backend
npm test
```

### Frontend

Frontend, backend'den ayrı statik dosyalardan oluşur (`http://localhost:3000` adresine `fetch` ile istek atar). Herhangi bir statik sunucu ile açılabilir, örneğin:

```bash
cd frontend
npx http-server -p 5500
```

Sonra tarayıcıda `http://localhost:5500/index.html` adresini aç. `frontend/js/api.js` içindeki `API_BASE` sabiti backend adresini gösterir, farklı bir port/host kullanıyorsan orayı güncelle.

## Notlar

- JWT secret `.env` dosyasındaki `JWT_SECRET` ile set edilebilir (yoksa geliştirme fallback'i kullanılır — bkz. `backend/src/config.js`).
- Test çalıştırıldığında (`NODE_ENV=test`) veritabanı bellekte (`:memory:`) kurulur, gerçek `data.sqlite` dosyasına dokunulmaz.
- Detaylı ilerleme ve bilinen sorunlar için `PROGRESS.md` dosyasına bakın.
