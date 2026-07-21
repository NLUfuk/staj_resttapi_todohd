# DESIGN.md — UI Tasarım Sistemi

> Bu dosya projenin görsel dilini tanımlar. Yeni bir sayfa/komponent yazarken (veya bir AI asistanına yazdırırken) buradaki token'lara ve component reçetelerine uy. Amaç: **tutarlı, modern, profesyonel bir helpdesk/admin panel** görünümü.

---

## 1. Marka & Ton

- **Karakter:** Sade, ciddi, "SaaS dashboard" havası (referans: Linear, Vercel, Render).
- **Öncelik:** Koyu tema (dark-first). Açık tema opsiyonel ama desteklenmeli.
- **İlke:** Az ama net. Gereksiz gölge/gradyan yok. Boşluk (whitespace) tasarımın parçasıdır.
- **Yoğunluk:** Veri odaklı — tablolar, rozetler, durum etiketleri temiz ve okunur olmalı.

---

## 2. Renkler (CSS Değişkenleri)

Bunu global CSS'in en üstüne koy. Renklere **her zaman değişken üzerinden** eriş, asla hex hard-code etme.

```css
:root {
  /* Yüzeyler (koyu tema) */
  --bg:            #0b0d12;   /* sayfa arka planı */
  --surface:       #14171f;   /* kart / panel */
  --surface-2:     #1b1f2a;   /* iç içe panel, hover zemini */
  --border:        #262b36;   /* çizgiler, ayraçlar */

  /* Metin */
  --text:          #e7e9ee;   /* ana metin */
  --text-muted:    #9aa2b1;   /* ikincil metin, açıklama */
  --text-faint:    #6b7280;   /* placeholder, disabled */

  /* Marka rengi (aksiyon) */
  --primary:       #6d5efc;   /* butonlar, linkler, aktif durum */
  --primary-hover: #7d70ff;
  --primary-soft:  #6d5efc22;  /* açık zemin (rozet, seçili satır) */

  /* Durum renkleri */
  --success:       #22c55e;
  --warning:       #f59e0b;
  --danger:        #ef4444;
  --info:          #38bdf8;

  /* Yarıçap & gölge */
  --radius-sm: 6px;
  --radius:    10px;
  --radius-lg: 16px;
  --shadow:    0 4px 20px rgba(0,0,0,.35);
  --shadow-sm: 0 1px 3px rgba(0,0,0,.25);
}

/* Açık tema (opsiyonel) */
[data-theme="light"] {
  --bg: #f7f8fa;  --surface: #ffffff;  --surface-2: #f0f2f5;
  --border: #e3e6ea;  --text: #1a1d24;  --text-muted: #5a6270;
  --text-faint: #9aa2b1;  --primary-soft: #6d5efc18;
  --shadow: 0 4px 20px rgba(0,0,0,.08); --shadow-sm: 0 1px 3px rgba(0,0,0,.06);
}
```

**Durum → renk eşlemesi (helpdesk için):**

| Durum | Renk | Kullanım |
|---|---|---|
| Açık / Yeni | `--info` | yeni talep |
| İşlemde | `--warning` | atanmış, çözülüyor |
| Çözüldü | `--success` | kapatıldı |
| Reddedildi / Hata | `--danger` | iptal, hatalı |

---

## 3. Tipografi

```css
body {
  font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text);
  background: var(--bg);
}
```

- **Font:** Inter (Google Fonts) — dashboard için ideal. Alternatif: system font stack.
- **Ölçek:** 12 / 14 / 16 / 20 / 24 / 32 px.
  - `12px` → rozet, etiket, tablo üst başlığı (uppercase, `letter-spacing: .04em`)
  - `14px` → gövde metni (varsayılan)
  - `20–24px` → sayfa başlığı
  - `32px` → sadece büyük metrik/istatistik sayıları
- **Ağırlık:** 400 (gövde), 500 (vurgulu), 600 (başlık). 700 nadiren.

---

## 4. Boşluk & Grid

- **Spacing ölçeği (px):** 4, 8, 12, 16, 24, 32, 48. Ara değer kullanma.
- **Sayfa iç boşluğu:** 24–32px.
- **Kartlar arası boşluk:** 16px.
- **Layout:** Solda sabit **sidebar (240px)**, üstte **topbar (56px)**, ortada içerik. İçerik max genişlik ~1200px.

---

## 5. Komponentler (reçeteler)

### Buton
```css
.btn {
  display:inline-flex; align-items:center; gap:8px;
  padding:8px 14px; border-radius:var(--radius-sm);
  font-size:14px; font-weight:500; cursor:pointer;
  border:1px solid transparent; transition:.15s;
}
.btn-primary   { background:var(--primary); color:#fff; }
.btn-primary:hover { background:var(--primary-hover); }
.btn-secondary { background:var(--surface-2); color:var(--text); border-color:var(--border); }
.btn-ghost     { background:transparent; color:var(--text-muted); }
.btn-danger    { background:var(--danger); color:#fff; }
.btn:disabled  { opacity:.5; cursor:not-allowed; }
```

### Input / Form
```css
.input {
  width:100%; padding:9px 12px; font-size:14px;
  background:var(--surface-2); color:var(--text);
  border:1px solid var(--border); border-radius:var(--radius-sm);
  transition:.15s;
}
.input:focus { outline:none; border-color:var(--primary); box-shadow:0 0 0 3px var(--primary-soft); }
.input::placeholder { color:var(--text-faint); }
label { font-size:13px; color:var(--text-muted); margin-bottom:6px; display:block; }
```

### Kart / Panel
```css
.card {
  background:var(--surface); border:1px solid var(--border);
  border-radius:var(--radius); padding:20px; box-shadow:var(--shadow-sm);
}
```

### Rozet / Durum etiketi
```css
.badge {
  display:inline-flex; align-items:center; gap:6px;
  padding:3px 10px; border-radius:999px;
  font-size:12px; font-weight:500;
  background:var(--primary-soft); color:var(--primary);
}
.badge-success { background:#22c55e22; color:var(--success); }
.badge-warning { background:#f59e0b22; color:var(--warning); }
.badge-danger  { background:#ef444422; color:var(--danger); }
.badge-info    { background:#38bdf822; color:var(--info); }
```

### Tablo (helpdesk talep listesi)
```css
table { width:100%; border-collapse:collapse; font-size:14px; }
thead th {
  text-align:left; padding:10px 14px; font-size:12px;
  text-transform:uppercase; letter-spacing:.04em;
  color:var(--text-muted); border-bottom:1px solid var(--border);
}
tbody td { padding:12px 14px; border-bottom:1px solid var(--border); }
tbody tr:hover { background:var(--surface-2); }
```

### Sidebar öğesi
```css
.nav-item {
  display:flex; align-items:center; gap:10px;
  padding:9px 12px; border-radius:var(--radius-sm);
  color:var(--text-muted); font-size:14px; cursor:pointer;
}
.nav-item:hover  { background:var(--surface-2); color:var(--text); }
.nav-item.active { background:var(--primary-soft); color:var(--primary); font-weight:500; }
```

### Modal
- Arka plan: `rgba(0,0,0,.5)` overlay.
- Kutu: `.card` + `max-width:480px`, ortalanmış, `box-shadow:var(--shadow)`.
- Başlık üstte, aksiyon butonları altta sağa yaslı (`Vazgeç` ghost + `Onayla` primary).

### Toast / Bildirim
- Sağ altta, `.card` stili, sol kenarında 3px renkli çizgi (durum rengi).
- 4 sn sonra otomatik kapanır.

---

## 6. Roller & Erişim (bu projeye özel)

Panel role göre kısıtlanıyor (`admin`, `dept_lead` vb.). UI kuralı:

- Kullanıcının görmemesi gereken menü/aksiyon **DOM'a hiç basılmasın** (sadece `display:none` yeterli değil — güvenlik backend'de).
- `dept_lead` gibi kısıtlı roller için "scoped panel" başlığında rolü göster: küçük bir rozet (`.badge`) ile "Departman Yöneticisi" yaz.
- Yetkisiz aksiyona basılırsa `--danger` renkli toast: "Bu işlem için yetkiniz yok."

---

## 7. Erişilebilirlik & Detaylar

- Kontrast: metin/zemin oranı en az **4.5:1** (koyu temada `--text-muted` küçük fontta yeterli).
- Her interaktif öğede görünür `:focus` durumu (yukarıdaki `box-shadow` ring).
- Buton ve linkler klavyeyle erişilebilir (`tab`).
- İkonlar için `aria-label`; sadece ikon olan butonlarda zorunlu.
- Animasyonlar 150–200ms, `ease`. Abartma.

---

## 8. AI asistanına talimat (kopyala-yapıştır)

> "Bu projedeki tüm UI'ı `DESIGN.md`'deki tasarım sistemine göre yaz. Renkleri sadece CSS değişkenleri üzerinden kullan, hex hard-code etme. Component'leri dosyadaki reçetelere (btn, card, badge, input, table) göre kur. Koyu tema öncelikli, spacing ölçeğine (4/8/12/16/24/32) sadık kal. Yeni bir stil gerekirse önce mevcut token'lardan türet."
