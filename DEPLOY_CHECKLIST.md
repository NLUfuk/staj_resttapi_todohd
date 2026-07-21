# DEPLOY_CHECKLIST.md

> **Canlı:** `https://staj-resttapi-todohd.onrender.com` (Render Free Web Service,
> `NLUfuk/staj_resttapi_todohd` reposunun `main` dalına bağlı, otomatik deploy).
> Demo hesaplar için `README.md`'ye bakın; veri kaybolduysa aşağıdaki "Seed endpoint"
> bölümüyle yeniden doldurun.

SQLite korunur, PostgreSQL'e geçiş yok (bkz. `SPEC_ATAMA_MODULU.md` §8). `data.sqlite`
tek dosya olduğu için host'ta **kalıcı disk (volume)** şart - volume olmadan her
deploy'da veri sıfırlanabilir (Render free planda gözlemlendiği üzere tutarlı değil,
bazı redeploy'lar veriyi koruyor bazıları koruyor - bkz. "Kalıcı disk kısıtı").

## Seed endpoint (shell erişimi olmayan hostlar için)

Render free planda shell/console yok, yani `npm run seed` doğrudan çalıştırılamıyor.
Bunun yerine `SEED_SECRET` env değişkeni set edildiğinde açılan bir endpoint var:

```
POST /api/admin/seed
X-Seed-Secret: <SEED_SECRET değeri>
```

Tam kartezyen demo veri setini (bkz. `backend/src/seed.js`) sıfırdan yeniden oluşturur
- admin/dept_lead/user hesapları, departmanlar, todo'lar, ticket'lar dahil. `SEED_SECRET`
set edilmemişse route 404 döner (tamamen kapalı). Doğru header olmadan 403.

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
| `MAIL_DRIVER` | `console` (varsayılan, dev), `resend`, `gmail` veya `sendgrid` (prod) | Prod'da `sendgrid` önerilir (bkz. not) - aksi halde onay mailleri sadece sunucu loguna yazılır, kullanıcıya ulaşmaz |
| `RESEND_API_KEY` | Resend API anahtarı | `MAIL_DRIVER=resend` iken zorunlu |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Gönderici Gmail adresi + Google Hesap → Uygulama Şifreleri'nden alınan 16 haneli şifre (2 Adımlı Doğrulama açık olmalı) | `MAIL_DRIVER=gmail` iken ikisi de zorunlu - **Render free planda çalışmaz** (bkz. not) |
| `SENDGRID_API_KEY` / `SENDGRID_FROM` | SendGrid API anahtarı + Single Sender Verification ile doğrulanmış gönderici adresi | `MAIL_DRIVER=sendgrid` iken ikisi de zorunlu |
| `APP_URL` | Onay linklerinin işaret ettiği frontend origin'i (`utils/mailer.js` / `routes/auth.routes.js`) | Evet - yoksa link `http://localhost:5500`'e düşer, canlıda çalışmaz |
| `NODE_ENV` | `production` | Rate limit / log davranışı için |
| `SEED_SECRET` | `POST /api/admin/seed`'i açan paylaşılan sır | Hayır - unset ise endpoint tamamen kapalı (404) |

## Deploy öncesi doğrulama

1. `npm test` (backend) yeşil.
2. `npm run seed` gerçek `data.sqlite` üzerinde hatasız çalışıyor (ilk kurulumda demo veri için opsiyonel).
3. Volume mount edilmiş ve `data.sqlite`'ın deploy'lar arası kalıcı olduğu doğrulanmış (bir deploy sonrası veri kaybolmuyor).
4. `JWT_SECRET`, `CORS_ORIGINS`, `APP_URL`, `MAIL_DRIVER`, (varsa) `RESEND_API_KEY` set edilmiş.
5. `/api/health` 200 dönüyor, `/api-docs` erişilebilir.
6. Gerçek bir kayıt + onay maili akışı prod ortamında uçtan uca denenmiş (özellikle `MAIL_DRIVER=resend` ile).

> **Not (2026-07-21, mail sürücüsü geçmişi):**
> 1. `MAIL_DRIVER=resend` yerelde çalıştı ama sandbox `RESEND_FROM=onboarding@resend.dev`
>    yalnızca hesap sahibinin kendi doğrulanmış e-postasına gönderime izin veriyor -
>    domain doğrulanmadan başka alıcılara mail gitmiyor.
> 2. `MAIL_DRIVER=gmail`'e geçildi (domain gerektirmiyor) - yerelde çalıştı, ama
>    **Render free planına deploy edilince SMTP bağlantıları (hem 465 hem 587 portu)
>    timeout ile başarısız oldu** - platform giden SMTP trafiğini engelliyor (yaygın bir
>    ücretsiz PaaS kısıtı, spam önleme amaçlı). `nodemailer` config'i (port/TLS) hiçbir
>    şekilde bunu aşamadı, tamamen platform seviyesinde bir engel.
> 3. `MAIL_DRIVER=sendgrid`'e geçildi - SendGrid'in Web API'si HTTPS üzerinden çalışıyor
>    (SMTP değil), bu yüzden platform port engeline takılmıyor. Single Sender
>    Verification (tek bir e-posta doğrulama, domain gerekmiyor) ile herhangi bir
>    alıcıya gönderim açıldı. Production'da doğrulandı, çalışıyor.
>
> **Sonuç:** Domain'i olmayan bir gönderici için SMTP tabanlı sürücüler (`gmail`) sadece
> yerelde/SMTP'yi engellemeyen hostlarda güvenilir. Herhangi bir PaaS'a deploy ediliyorsa
> `resend` (domainli) veya `sendgrid` (Single Sender Verification'lı) tercih edilmeli.

## Kapsam dışı / gerçekleşen

Bu checklist başlangıçta yalnızca dokümantasyon olarak yazılmıştı (altyapı erişimi
olmadığı varsayımıyla). **2026-07-21'de gerçek bir Render deploy'u yapıldı** (bkz.
dosyanın en üstündeki canlı link) - kullanıcının kendi Render/GitHub/SendGrid
hesaplarıyla, tarayıcı otomasyonu (claude-in-chrome) üzerinden adım adım. Bu checklist
artık hem "nasıl deploy edilir" hem de "bu projede gerçekte ne yapıldı" belgesi.
