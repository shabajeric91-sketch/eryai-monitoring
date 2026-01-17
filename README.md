# EryAI Monitoring

System monitoring och automatiska tester för hela EryAI-plattformen.

## Endpoints

| Endpoint | Beskrivning |
|----------|-------------|
| `/api/status` | Status-sida (HTML) för alla system |
| `/api/health` | Snabb health check (JSON) |
| `/api/test` | Kör fullständigt test-suite (19 tester) |

## Vad testas?

### Landing (eryai.tech)
- Sidan laddas
- Demo-länk finns

### Demo Restaurant (ery-ai-demo-restaurang.vercel.app)
- Sidan laddas
- Restaurant API
- Messages API
- Typing API
- Skapa chat-session
- Session sparas i Supabase
- Meddelanden sparas
- Handoff triggas
- Human takeover fungerar

### Dashboard (dashboard.eryai.tech)
- Login-sida laddas
- Redirect till login

### Sales (sales.eryai.tech)
- Login-sida laddas

### Supabase
- Anslutning fungerar
- Bella Italia customer finns
- Alla tabeller finns
- Typing-kolumner finns

### Email
- Resend API-nyckel konfigurerad

## Cron Jobs

Testerna körs automatiskt **kl 08:00 svensk tid** varje dag.

Vid fel skickas email till eric@eryai.tech.

## Environment Variables

Lägg till i Vercel:

```
SUPABASE_URL=https://tjqxseptmeypfsymrrln.supabase.co
SUPABASE_SERVICE_KEY=xxx
RESEND_API_KEY=xxx
```

## URLs

- Status: https://eryai-monitoring.vercel.app/api/status
- Health: https://eryai-monitoring.vercel.app/api/health
- Test: https://eryai-monitoring.vercel.app/api/test
