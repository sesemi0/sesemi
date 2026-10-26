# 🚀 اجرای SESEMI روی سرور یا سیستم خودت (با Docker)

این راهنما سایت SESEMI رو به‌همراه بک‌اند هوشمند چت Sesi روی سیستم خودت بالا می‌آره.

## ✅ پیش‌نیازها

- Docker + Docker Compose (نسخه جدید Docker خودش compose داره)
- اگه می‌خوای چت Sesi با هوش مصنوعی واقعی جواب بده: **Ollama** هم نصب باشه (روی همون سیستم یا یه سیستم دیگه توی شبکه)

> Node.js جدا لازم نیست — داخل Docker خودش هست. ولی اگه بدون Docker اجرا می‌کنی، Node.js نسخه ۲۰ به بالا + bun لازم داری.

## 🏃 اجرا با Docker (۳ دستور)

```bash
cd sesemi
docker compose up -d --build
```

سایت آماده‌ست: **http://localhost:8788** (یا `http://IP-سرور:8788` از بیرون)

## 🤖 وصل کردن چت Sesi به Ollama

### اگه Ollama روی همون سیستمه:

```bash
ollama pull qwen3:14b
```
همین کافیه — پیش‌فرض کانتینر همین مدل رو از `host.docker.internal:11434` می‌گیره.

### اگه Ollama روی یه سیستم دیگه‌ست (مثلاً سیستم گیمینگ با کارت گرافیک):

1. روی سیستم گیمینگ، Ollama رو طوری اجرا کن که از شبکه قابل دسترس باشه:
   - ویندوز: متغیر محیطی `OLLAMA_HOST=0.0.0.0` رو ست کن و Ollama رو ری‌استارت کن
   - لینوکس: `OLLAMA_HOST=0.0.0.0 ollama serve`
2. توی `docker-compose.yml` این خط رو عوض کن:
   ```yaml
   LLM_BASE_URL: http://192.168.1.XX:11434/v1   # آیپی سیستم گیمینگ
   ```
3. دوباره: `docker compose up -d`

### مدل‌های پیشنهادی:

| سیستم | مدل | دستور |
|---|---|---|
| کارت گرافیک ۱۶ گیگ | qwen3:14b | `ollama pull qwen3:14b` |
| سیستم ضعیف‌تر | qwen3:8b | `ollama pull qwen3:8b` (بعد LLM_MODEL رو عوض کن) |
| فقط CPU | qwen3:4b | `ollama pull qwen3:4b` |

## 🔄 بدون Docker (اختیاری)

```bash
bun install
bun run build
node server.mjs        # یا: PORT=8788 node server.mjs
```

## 📬 فرم تماس کجا ذخیره می‌شه؟

Brief ها توی `data/briefs.jsonl` ذخیره می‌شن (پوشه `data` کنار compose) — با اکسل یا هر ادیتوری متنی می‌تونی بازش کنی. چون volume شده، با پاک شدن کانتینر از بین نمی‌ره.

## 🛠️ دستورات کاربردی

```bash
docker compose logs -f          # دیدن لاگ زنده
docker compose restart          # ری‌استارت
docker compose down             # خاموش کردن
docker compose up -d --build    # بعد از تغییر کد، دوباره بساز و اجرا کن
```

## 🔁 اتصال به دامنه (اختیاری)

جلوی کانتینر می‌تونی Caddy یا Nginx بذاری:

```yaml
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on: [sesemi]
volumes: { caddy_data: {} }
```

Caddyfile:
```
sesemi.example.com {
    reverse_proxy sesemi:8788
}
```

## ⚠️ نکات امنیتی

- کلید API هیچ سرویس ابری رو **توی فایل‌ها commit نکن** — فقط توی env یا compose محلی
- پورت 8788 رو اگه مستقیم به اینترنت می‌دی، حتماً پشت reverse proxy با HTTPS بذار
- `VITE_ANALYTICS_ENDPOINT` فعلاً لازم نیست؛ بقیه قابلیت‌ها بدون اون هم کار می‌کنن
