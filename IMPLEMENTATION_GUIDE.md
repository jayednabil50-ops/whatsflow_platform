# WS Center - WhatsApp Platform Implementation Guide

## Overview

This guide covers the complete implementation of the WhatsApp QR code connection system and webhook integration for the WS Center platform.

## Architecture

### Core Components

1. **Session Manager** (`lib/whatsapp/supabase-session-manager.ts`)
   - Manages WhatsApp session lifecycle
   - Integrates with Supabase for persistence
   - Handles QR code generation
   - Manages socket connections

2. **Webhook Manager** (`lib/whatsapp/webhook-manager.ts`)
   - Queues webhook deliveries
   - Implements retry logic with exponential backoff
   - Persists delivery history to database
   - Handles webhook payload formatting

3. **Enhanced Session Manager** (`lib/whatsapp/session-manager-enhanced.ts`)
   - Combines session and webhook managers
   - Handles incoming messages
   - Logs messages to database
   - Queues webhooks for delivery

### API Routes

#### Session Management
- `POST /api/whatsapp/sessions` - Create new session
- `GET /api/whatsapp/sessions` - List all sessions
- `POST /api/whatsapp/sessions/[id]/qr` - Start QR connection
- `GET /api/whatsapp/sessions/[id]/qr` - Get QR code
- `GET /api/whatsapp/sessions/[id]/status` - Get session status
- `POST /api/whatsapp/sessions/[id]/disconnect` - Disconnect session

#### Webhook Management
- `POST /api/whatsapp/sessions/[id]/webhook` - Save webhook URL
- `GET /api/whatsapp/sessions/[id]/webhook` - Get webhook URL
- `DELETE /api/whatsapp/sessions/[id]/webhook` - Remove webhook URL
- `GET /api/whatsapp/sessions/[id]/webhook-deliveries` - Get delivery history
- `POST /api/whatsapp/sessions/[id]/webhook-deliveries/retry` - Retry failed delivery

#### Message Handling
- `POST /api/whatsapp/sessions/[id]/send-message` - Send outbound message

## Database Schema

### whatsapp_sessions
```sql
- id (UUID, primary key)
- user_id (UUID, foreign key)
- name (text)
- phone_number (text)
- status (text)
- qr_code (text)
- webhook_url (text)
- webhook_secret (text)
- webhook_events (text array)
- created_at (timestamp)
- updated_at (timestamp)
```

### messages
```sql
- id (UUID, primary key)
- session_id (UUID, foreign key)
- user_id (UUID, foreign key)
- direction (text: 'inbound' or 'outbound')
- remote_jid (text)
- message_type (text)
- body (text)
- status (text)
- external_message_id (text)
- created_at (timestamp)
```

### webhook_deliveries
```sql
- id (UUID, primary key)
- session_id (UUID, foreign key)
- event_type (text)
- payload (jsonb)
- status (text: 'pending', 'delivered', 'failed')
- http_status (integer)
- attempts (integer)
- next_retry_at (timestamp)
- last_error (text)
- created_at (timestamp)
- delivered_at (timestamp)
```

## Implementation Steps

### Step 1: Update Session Manager Imports

Replace all imports from `@/lib/whatsapp/session-manager` with `@/lib/whatsapp/supabase-session-manager` in:
- `app/api/whatsapp/sessions/route.ts`
- `app/api/whatsapp/sessions/[id]/qr/route.ts`
- `app/api/whatsapp/sessions/[id]/status/route.ts`
- `app/api/whatsapp/sessions/[id]/disconnect/route.ts`
- `app/api/whatsapp/sessions/[id]/send-message/route.ts`

### Step 2: Initialize Webhook Queue Processor

In `app/layout.tsx` or a startup hook, add:

```typescript
import { startWebhookQueueProcessor } from '@/lib/whatsapp/webhook-manager';

// Call this once on app startup
startWebhookQueueProcessor(5000); // Process queue every 5 seconds
```

### Step 3: Update Environment Variables

Add to `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Step 4: Deploy Database Migrations

Run the migration in `supabase/migrations/0001_init.sql` to create all required tables.

### Step 5: Update Frontend Components

Replace `app/app/sessions/new/page.tsx` with `app/app/sessions/new/page-improved.tsx` for:
- Better QR code display
- Improved webhook setup UI
- Copy payload functionality
- Better error handling

## Webhook Payload Format

When a message is received, the webhook receives:

```json
{
  "event": "message.received",
  "timestamp": 1715000000000,
  "data": {
    "sessionId": "sess_1715000000000_abc123",
    "sessionName": "Support Line",
    "message": {
      "id": "wamid.HBgM...",
      "from": "8801711111111",
      "type": "text",
      "text": "Hello, is this available?",
      "raw": {}
    }
  }
}
```

## Webhook Retry Logic

- **Max Attempts**: 3 (configurable)
- **Backoff Strategy**: Exponential (1s, 2s, 4s)
- **Timeout**: 30 seconds per attempt
- **Success Codes**: 200-299

## Known Issues and Fixes

### Issue 1: Session Not Persisting Between Restarts
**Fix**: Implemented Supabase integration for session persistence. Sessions are now saved to database on creation and update.

### Issue 2: Webhook Delivery Failures Not Retried
**Fix**: Implemented webhook-manager with automatic retry logic and exponential backoff.

### Issue 3: No Message History
**Fix**: All incoming and outgoing messages are now logged to the `messages` table.

### Issue 4: Webhook URL Validation Missing
**Fix**: Added URL format validation and HTTPS requirement (localhost allowed for testing).

### Issue 5: No Webhook Delivery Tracking
**Fix**: All webhook deliveries are tracked in the `webhook_deliveries` table with status, attempts, and error information.

## Testing

### Test QR Code Connection
1. Create a new session with valid phone number
2. Verify QR code is generated and displayed
3. Scan QR code with WhatsApp Linked Devices
4. Verify session status changes to "connected"

### Test Webhook Delivery
1. Set webhook URL to a test endpoint (e.g., n8n, Make, or localhost)
2. Send a message to the connected WhatsApp number
3. Verify webhook is called with correct payload
4. Check webhook delivery status in database

### Test Webhook Retry
1. Set webhook URL to a non-existent endpoint
2. Send a message to trigger webhook
3. Verify webhook delivery is retried 3 times
4. Check retry intervals in logs

## Production Checklist

- [ ] Supabase project created and configured
- [ ] Database migrations applied
- [ ] Environment variables set
- [ ] Webhook queue processor initialized
- [ ] HTTPS enforced for webhook URLs
- [ ] Error logging configured
- [ ] Rate limiting implemented
- [ ] Session timeout configured
- [ ] Backup strategy for session files
- [ ] Monitoring and alerting set up

## Troubleshooting

### QR Code Not Generating
- Check Baileys library version
- Verify WhatsApp Web API is accessible
- Check browser compatibility (Chrome/Chromium required)

### Webhook Not Delivering
- Verify webhook URL is HTTPS (or localhost)
- Check webhook URL is accessible
- Review webhook delivery logs in database
- Check firewall/network restrictions

### Session Disconnecting
- Check WhatsApp account security settings
- Verify device is still linked in WhatsApp
- Check internet connection stability
- Review error logs for specific disconnect reason

## API Examples

### Create Session
```bash
curl -X POST http://localhost:3000/api/whatsapp/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support Line",
    "countryCode": "BD",
    "phone": "1711111111",
    "webhookUrl": "https://n8n.example.com/webhook/whatsapp"
  }'
```

### Get QR Code
```bash
curl http://localhost:3000/api/whatsapp/sessions/sess_1715000000000_abc123/qr
```

### Save Webhook
```bash
curl -X POST http://localhost:3000/api/whatsapp/sessions/sess_1715000000000_abc123/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "webhookUrl": "https://n8n.example.com/webhook/whatsapp"
  }'
```

### Send Message
```bash
curl -X POST http://localhost:3000/api/whatsapp/sessions/sess_1715000000000_abc123/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "to": "8801711111111",
    "message": "Hello! How can I help you?"
  }'
```

### Get Webhook Deliveries
```bash
curl "http://localhost:3000/api/whatsapp/sessions/sess_1715000000000_abc123/webhook-deliveries?limit=50&offset=0&status=pending"
```

## Performance Optimization

1. **Message Indexing**: Index on `messages(session_id, created_at)`
2. **Webhook Delivery Indexing**: Index on `webhook_deliveries(session_id, status)`
3. **Session Caching**: Cache active sessions in memory
4. **Batch Webhook Processing**: Process multiple webhooks in batches

## Security Considerations

1. **Webhook Secret**: Implement HMAC signing for webhook payloads
2. **Rate Limiting**: Implement rate limiting on API endpoints
3. **Input Validation**: Validate all user inputs
4. **Database Encryption**: Encrypt sensitive data in database
5. **Access Control**: Implement proper authorization checks

## Future Enhancements

1. **Webhook Signature Verification**: Add HMAC signing
2. **Message Media Support**: Support images, videos, documents
3. **Group Messaging**: Support group messages
4. **Broadcast Lists**: Support broadcast messages
5. **Advanced Analytics**: Add message analytics dashboard
6. **Multi-language Support**: Add i18n for UI
