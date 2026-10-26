# Sesemi assistant and quick contact

The frontend works without a backend in explicitly labeled guide/preview mode.
It never claims a contact request was sent when no endpoint is configured.

Copy `.env.example` to `.env.local` and supply backend URLs to enable live mode.
Prefer same-origin routes. Vite environment values are public; never put an
OpenAI, Gemini, or other provider API key in a `VITE_` variable.

## Assistant

`VITE_AGENT_ENDPOINT=/api/agent`

POST JSON:

```json
{"messages":[{"role":"user","content":"سلام"}]}
```

Returns a successful HTTP response with:

```json
{"reply":"سلام! چطور می‌توانم کمک کنم؟"}
```

The frontend sends up to 20 recent messages, handles failures with retryable
input, and times out after 25 seconds. It expects a complete JSON response,
not an SSE stream. Messages remain in React memory, not persistent storage.

## Contact

`VITE_CONTACT_ENDPOINT=/api/contact`

POST JSON:

```json
{"name":"نام","contact":"شماره موبایل یا ایمیل","message":"شرح اختیاری"}
```

Return `{"ok":true}` with a successful HTTP status **only after** durable
storage or successful delivery. Failure leaves the form contents intact.

## Backend responsibilities

Validate and limit inputs, add rate limiting and spam protection, keep provider
credentials server-side, enforce allowed origins and privacy/retention policies,
and avoid logging personal data unnecessarily. No backend, live AI provider,
human handoff, or delivery service is included in this frontend repository.
