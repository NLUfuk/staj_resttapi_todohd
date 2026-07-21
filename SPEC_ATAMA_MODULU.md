# SPEC — Görev Atama Modülü (mevcut projeye eklenir)

> Bu doküman tek otoriter referanstır. Kod yazan agent bu spec dışına çıkmaz,
> mevcut çalışan kodu (departman/chat/ticket) BOZMADAN yalnızca aşağıdaki üç
> modülü ekler. Belirsizlik olursa dur ve sor — tahminle ilerleme.

## 0. Bağlam: Neyin Üstüne Ekliyoruz

Mevcut proje ÇALIŞIYOR ve BOZULMAYACAK. Zaten var olanlar:

- Auth: register/login/refresh/logout/me, JWT (15m) + refresh token (30g), bcrypt.
- Todos: `user_id`'ye bağlı, `due_date` + `priority` + sayfalama mevcut.
- Departman, kanal (chat), bildirim, audit log, dept_lead rolü, istatistik — hepsi test edilmiş.
- Yığın: Node + Express + **better-sqlite3** (SQLite). Şema `backend/src/db.js` içinde idempotent tutulur (ayrı migration aracı YOK). Route deseni: `backend/src/routes/*.routes.js`. Test: jest + supertest, in-memory DB, `tests/helpers.js`.

**PostgreSQL'e GEÇİLMEYECEK.** Üstüne ekleme yaptığımız için SQLite korunur; canlı deploy ayrı ele alınır (bkz. §8).

Eksik olan ve bu spec'in eklediği ÜÇ modül:

1. **Çoklu Todo Listesi** — kullanıcı todo'ları "liste"lere gruplar (Alışveriş, Elektrik…).
2. **Görev Atama + FSM** — bir görevi başka kullanıcıya atama; kabul/red/revize/tamamla akışı, tam zaman çizelgesi.
3. **E-posta Onayı** — kayıtta e-posta doğrulama; onaysız login engellenir.

---

## 1. User Story'ler

**US-1 (Çoklu liste):** Kayıtlı bir kullanıcı olarak, farklı alanlar için ayrı todo listeleri (ör. "Alışveriş", "Elektrik") oluşturabilmek istiyorum ki görevlerim konularına göre ayrışsın. Her listenin altına görev ekleyip çıkarabilmeliyim. Bir listeyi silersem altındaki görevler de silinmeli.

**US-2 (Atama):** Bir liste sahibi olarak, bir görevi başka bir kullanıcıya atayabilmek istiyorum (ör. "Elektrik" listesinde "Kablo al" görevini Ali'ye). Atanan kişiye bildirim gitmeli.

**US-3 (Kabul/Red/Revize):** Kendisine görev atanan kullanıcı olarak, atamayı **kabul** edebilmeli, **reddedebilmeli** (yorum zorunlu) veya **revize isteyip geri gönderebilmeliyim** (yorum zorunlu). Görev metnini DÜZENLEYEMEM — yalnızca durum değiştirir ve yorum yazarım.

**US-4 (Revize döngüsü):** Atayan kullanıcı olarak, "revize" ile geri gelen görevi düzenleyip (US-3'teki yoruma göre) atanana tekrar gönderebilmeliyim.

**US-5 (Tamamlama):** Atamayı kabul eden kullanıcı olarak, işi bitirince görevi **tamamlandı** (applied) olarak işaretleyebilmeliyim. Atayana bildirim gitmeli.

**US-6 (Görünürlük):** Atanan kullanıcı olarak, YALNIZCA bana atanan/talep edilen görevleri görürüm — atayanın listesinin geri kalanını görmem. Atayan olarak da benim atadıklarımın durumunu takip ederim.

**US-7 (Zaman çizelgesi):** Herhangi bir tarafın, bir atamanın tüm geçmişini (atandı → revize istendi → tekrar gönderildi → kabul → tamamlandı; her biri tarih + kim + yorum) kronolojik görebilmeliyim.

**US-8 (E-posta onayı):** Yeni kullanıcı olarak, kayıt sonrası e-postama gelen linke tıklayarak hesabımı onaylamalıyım. Onaylamadan login olamam.

---

## 2. Şema Eklemeleri (`backend/src/db.js`)

Mevcut `db.exec(...)` bloğunun sonuna, aynı idempotent tarzda ekle. Var olan tablolara dokunma.

```sql
-- US-1: Todo listeleri
CREATE TABLE IF NOT EXISTS todo_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_todo_lists_owner ON todo_lists(owner_id);

-- US-2..7: Atamalar (güncel durum)
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  assigner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','accepted','completed','rejected','revision','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assignments_assignee ON assignments(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_assigner ON assignments(assigner_id, status);

-- US-7: Olay geçmişi — HER geçiş bir satır (zaman çizelgesinin kaynağı)
CREATE TABLE IF NOT EXISTS assignment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,          -- 'assign','accept','reject','revise','resend','complete','cancel'
  from_status TEXT,
  to_status TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assignment_events_assignment
  ON assignment_events(assignment_id, created_at);

-- US-8: E-posta doğrulama token'ları
CREATE TABLE IF NOT EXISTS email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**users tablosuna kolon ekle** (mevcut `addColumnIfMissing` helper'ıyla, db.js'te alt kısımda):

```js
addColumnIfMissing('users', 'email', 'TEXT');
addColumnIfMissing('users', 'is_verified', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('todos', 'list_id', 'INTEGER REFERENCES todo_lists(id) ON DELETE CASCADE');
```

### 2.1 Mevcut veri için geri doldurma (backfill) — KRİTİK

Var olan todo'ların `list_id`'si NULL kalır; var olan kullanıcıların e-postası yok. Bozulmayı önlemek için db.js'te idempotent backfill:

- Her kullanıcı için yoksa bir varsayılan liste ("Genel") oluştur; o kullanıcının `list_id IS NULL` todo'larını bu listeye bağla.
- Var olan (e-postasız) kullanıcıları `is_verified = 1` yap ki eski hesaplar login olabilsin. E-posta zorunluluğu yalnızca YENİ kayıtlara uygulanır.

---

## 3. Durum Makinesi (FSM) — `backend/src/utils/assignmentFsm.js` (YENİ)

Tüm durum geçişleri tek noktadan. Route'lar asla doğrudan `status` yazmaz.

```js
const AssignmentStatus = Object.freeze({
  PENDING:'pending', REVISION:'revision', ACCEPTED:'accepted',
  COMPLETED:'completed', REJECTED:'rejected', CANCELLED:'cancelled',
});

// { mevcutDurum: { aksiyon: { to, by, requireComment } } }
const transitions = {
  pending: {
    accept: { to:'accepted',  by:'assignee', requireComment:false },
    reject: { to:'rejected',  by:'assignee', requireComment:true  },
    revise: { to:'revision',  by:'assignee', requireComment:true  },
    cancel: { to:'cancelled', by:'assigner', requireComment:false },
  },
  revision: {
    resend: { to:'pending',   by:'assigner', requireComment:false },
    cancel: { to:'cancelled', by:'assigner', requireComment:false },
  },
  accepted: {
    complete: { to:'completed', by:'assignee', requireComment:false },
    cancel:   { to:'cancelled', by:'assigner', requireComment:false },
  },
  // completed / rejected / cancelled = terminal (çıkış yok)
};
```

Geçiş fonksiyonu (aynı dosyada), sırasıyla: (1) geçiş geçerli mi (yoksa 409), (2) aktör doğru rolde mi — assignee/assigner (yoksa 403), (3) yorum gerekiyorsa var mı (yoksa 400), (4) `assignment_events`'e satır yaz, (5) `assignments.status` + `updated_at` güncelle, (6) karşı tarafa bildirim (mevcut `utils/notify.js` kullan). Bir SQLite transaction içinde yap.

**Hata deseni:** Mevcut kod düz `res.status(4xx).json({error})` kullanıyor; FSM fonksiyonu `{ ok:false, code, error }` döndürsün, route bunu status'e çevirsin (mevcut tarza uy, throw/HttpError sınıfı ekleme).

---

## 4. Route'lar

### 4.1 Listeler — `routes/lists.routes.js` (YENİ), `app.js`'e `/api/lists` olarak bağla

| Method/Path | Açıklama | Kural |
|---|---|---|
| `GET /api/lists` | Kendi listelerim (sayfalı) | `owner_id = req.user.id` |
| `POST /api/lists` | Liste oluştur | `name` zorunlu |
| `GET /api/lists/:id` | Tekil liste | sahiplik, yoksa 404 |
| `PATCH /api/lists/:id` | Yeniden adlandır | sahiplik |
| `DELETE /api/lists/:id` | Sil (görevler cascade) | sahiplik |
| `GET /api/lists/:id/items` | Listenin görevleri (sayfalı) | sahiplik |

`todos.routes.js` değişikliği: `POST /api/todos` artık opsiyonel `list_id` alır (verilmezse kullanıcının "Genel" listesine düşer); `list_id` başkasınınsa 400/404. Mevcut GET/PUT/DELETE davranışı korunur.

### 4.2 Atamalar — `routes/assignments.routes.js` (YENİ), `/api/assignments`

| Method/Path | Açıklama |
|---|---|
| `POST /api/todos/:id/assign` | `{ assignee_username veya assignee_id }` → atama oluştur, `assign` event'i, bildirim. Sadece görev sahibi atayabilir. Kendine atama 400. |
| `POST /api/assignments/:id/accept` | assignee → accepted |
| `POST /api/assignments/:id/reject` | assignee → rejected (`{ comment }` zorunlu) |
| `POST /api/assignments/:id/revise` | assignee → revision (`{ comment }` zorunlu) |
| `POST /api/assignments/:id/resend` | assigner → pending |
| `POST /api/assignments/:id/complete` | assignee → completed |
| `POST /api/assignments/:id/cancel` | assigner → cancelled |
| `GET /api/assignments/incoming` | Bana atananlar (`assignee_id=me`), `?status=` filtre, sayfalı |
| `GET /api/assignments/outgoing` | Benim atadıklarım (`assigner_id=me`), sayfalı |
| `GET /api/assignments/:id/timeline` | `assignment_events` kronolojik (yalnız taraflar erişir) |

Hepsi `transition()`'dan geçer. Görev metni bu uçların hiçbirinde değişmez.

### 4.3 Auth değişikliği — `auth.routes.js` + `utils/mailer.js` (YENİ)

- `POST /api/auth/register`: artık `email` de alır (zorunlu, format kontrolü, benzersiz). Kullanıcı `is_verified=0` oluşur. Rastgele token üret, hash'ini `email_verifications`'a yaz (expiry: now +24h), `mailer.send()` ile doğrulama linki gönder. **Token'ı response'a KOYMA** (güvenlik). Yanıt: "onay maili gönderildi".
- `GET /api/auth/verify?token=...`: token geçerli + expire değil + kullanılmamışsa → `is_verified=1`, token'ı `used_at` ile işaretle. Başarı/h": uygun mesaj.
- `POST /api/auth/resend-verification`: `{ email }` → yeni token + mail.
- `POST /api/auth/login`: kullanıcı `is_verified=0` ise **403** (`"e-postanı onayla"`). Aksi halde mevcut akış (token + refresh).

`utils/mailer.js`: `MAIL_DRIVER=console` ise linki `console.log`'a basar (dev); `resend` ise Resend API'siyle gönderir (prod). Tek `send({ to, subject, html })` arayüzü.

---

## 5. OpenAPI (`backend/src/openapi.js`)

Yeni tüm uçları ve şemaları (TodoList, Assignment, AssignmentEvent) mevcut el-yazımı spec tarzında ekle. `email`/`is_verified` alanlarını User şemasına yansıt. Swagger UI'da hepsi "Try it out" ile denenebilir olmalı.

---

## 6. Testler (`backend/tests/*.test.js`)

Mevcut jest+supertest deseni ve `helpers.js`'i kullan. **KRİTİK:** `tests/helpers.js` içindeki `resetDb()` fonksiyonuna yeni tabloları ekle (silme sırası FK'ye dikkat: önce `assignment_events`, `assignments`, `todo_lists`, `email_verifications`; sonra mevcutlar). `sqlite_sequence` temizliğine de ekle. Aksi halde testler birbirine sızar.

Yeni test dosyaları ve kapsanması gerekenler:

- `lists.test.js`: CRUD, sahiplik izolasyonu (A, B'nin listesini göremez → 404), liste silince görevler gidiyor.
- `assignments.test.js`: atama oluşturma, incoming/outgoing doğru filtre, kendine atama 400.
- `assignmentFsm.test.js`: **geçersiz geçişler** — pending→complete (409), yorumsuz reject/revise (400), başkasının atamasına aksiyon (403), terminal durumdan çıkış (409), tam mutlu yol (assign→accept→complete), revize döngüsü (revise→resend→accept).
- `timeline.test.js`: geçişler sonrası event sırası + yorumlar doğru.
- `emailVerification.test.js`: onaysız login 403, verify sonrası login 200, geçersiz/expired token, eski (e-postasız) kullanıcı login olabiliyor.

Tüm mevcut testler + yeniler yeşil olmalı (`npm test`).

---

## 7. Frontend (`frontend/` — vanilla JS, mevcut)

Mevcut `js/api.js` + sayfa yapısına uygun ekle (yeni framework GETİRME):

- Dashboard'da liste seçici (dropdown/sekme) + liste oluşturma.
- Görev satırında "Ata" butonu (kullanıcı seç → assign).
- Yeni "Gelen Görevler" ekranı: incoming atamalar, her birinde Kabul / Reddet(yorum) / Revize(yorum) / Tamamla butonları duruma göre.
- Atama detayında timeline gösterimi.
- Kayıt sonrası "e-postanı onayla" bilgi ekranı; verify sonucu sayfası.

---

## 8. Canlı Deploy (SQLite ile)

SQLite korunduğu için: Railway/Render'da **kalıcı disk (volume)** kullan — `data.sqlite` volume'da tutulur, yeniden deploy'da veri uçmaz. `PORT`, `JWT_SECRET`, `CORS_ORIGINS`, `RESEND_API_KEY`, `APP_URL` env değişkenleri girilir. Detay: `DEPLOY_CHECKLIST.md`. (Veri hacmi ciddileşirse Postgres'e geçiş ayrı bir iş olarak sonra değerlendirilir — bu spec kapsamı DEĞİL.)

---

## 9. Uygulama Sırası (fazlar — sırayla, her biri testi yeşil bırakır)

1. **Faz A — Çoklu liste:** şema + backfill + lists.routes + todos `list_id` + testler.
2. **Faz B — Atama + FSM:** şema + `assignmentFsm.js` + assignments.routes + assign ucu + testler.
3. **Faz C — Zaman çizelgesi + bildirim:** timeline ucu + notify entegrasyonu + testler.
4. **Faz D — E-posta onayı:** users kolonları + mailer + register/verify/login değişikliği + testler.
5. **Faz E — OpenAPI + Frontend:** yeni uçları Swagger'a, ekranları frontend'e ekle.
6. **Faz F — Deploy:** volume + env + canlı doğrulama.

Her fazın kapanışı: `npm test` yeşil + `openapi.js` güncel + `PROGRESS.md`'ye kayıt.

---

## 10. Agent İçin Kurallar (drift önleme)

- Mevcut çalışan modülleri (departman, chat, ticket, admin) DEĞİŞTİRME. Sadece bu spec'in tablolarını/route'larını EKLE.
- SQLite'ta kal, better-sqlite3 kullan, mevcut db.js idempotent desenini izle. Yeni migration aracı KURMA.
- Yeni route dosyaları mevcut `*.routes.js` tarzını birebir izlesin (`router.use(requireAuth)`, düz `db.prepare`).
- `resetDb()`'yi güncellemeyi UNUTMA (yoksa testler sızar).
- Bir faz bitmeden diğerine geçme; her faz sonunda `npm test` çalıştır, kırmızı varsa dur.
- Spec'te olmayan bir karar gerekiyorsa (ör. "atanan görev başkasına devredilebilsin mi") DUR ve sor; kendi başına özellik ekleme.
