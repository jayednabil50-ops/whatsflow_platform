# Migration Guide: From In-Memory to Database-Backed Sessions

## Overview

This guide helps you migrate from the in-memory session manager to the new database-backed implementation with webhook support.

## Changes Summary

| Component | Before | After |
|-----------|--------|-------|
| Session Storage | In-memory Map | Supabase Database |
| Webhook Delivery | Direct HTTP call | Queued with retry |
| Message Logging | None | Database table |
| Webhook Tracking | None | Delivery history |
| Error Handling | Basic | Comprehensive |

## Step-by-Step Migration

### Step 1: Backup Current Data

```bash
# Export current sessions if needed
# Since sessions are in-memory, they will be lost on restart
# Make sure to note any important session IDs
```

### Step 2: Update Package Dependencies

Ensure you have the required packages:

```bash
npm install @supabase/supabase-js @hapi/boom @whiskeysockets/baileys qrcode axios
```

### Step 3: Update Environment Configuration

Add to `.env.local`:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional: Webhook Configuration
WEBHOOK_MAX_RETRIES=3
WEBHOOK_TIMEOUT_MS=30000
WEBHOOK_QUEUE_INTERVAL_MS=5000
```

### Step 4: Deploy Database Schema

Run the migration to create tables:

```bash
# Using Supabase CLI
supabase db push

# Or manually run the SQL in supabase/migrations/0001_init.sql
```

### Step 5: Update API Routes

#### Before:
```typescript
import { getSession, updateSession } from "@/lib/whatsapp/session-manager";
```

#### After:
```typescript
import { getSession, updateSession } from "@/lib/whatsapp/supabase-session-manager";
```

Apply this change to:
- `app/api/whatsapp/sessions/route.ts`
- `app/api/whatsapp/sessions/[id]/qr/route.ts`
- `app/api/whatsapp/sessions/[id]/status/route.ts`
- `app/api/whatsapp/sessions/[id]/disconnect/route.ts`
- `app/api/whatsapp/sessions/[id]/send-message/route.ts`
- `app/api/whatsapp/sessions/[id]/webhook/route.ts`

### Step 6: Initialize Webhook Processor

In your app initialization (e.g., `app/layout.tsx` or a startup hook):

```typescript
import { startWebhookQueueProcessor } from '@/lib/whatsapp/webhook-manager';

// Add this in a useEffect or server-side initialization
useEffect(() => {
  // Start webhook queue processor
  startWebhookQueueProcessor(5000); // Process every 5 seconds
}, []);
```

### Step 7: Update Frontend Components

Replace the old session creation page:

```bash
# Backup old file
mv app/app/sessions/new/page.tsx app/app/sessions/new/page.tsx.backup

# Use improved version
cp app/app/sessions/new/page-improved.tsx app/app/sessions/new/page.tsx
```

### Step 8: Update Session Detail Page

Update `app/app/sessions/[id]/page.tsx` to use new session manager:

```typescript
// Before
import { getSession } from "@/lib/whatsapp/session-manager";

// After
import { getSession } from "@/lib/whatsapp/supabase-session-manager";
```

### Step 9: Add Webhook Delivery Monitoring

Create a new page to monitor webhook deliveries:

```typescript
// app/app/sessions/[id]/webhook-logs/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function WebhookLogsPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDeliveries = async () => {
      try {
        const res = await fetch(
          `/api/whatsapp/sessions/${sessionId}/webhook-deliveries?limit=50`
        );
        const data = await res.json();
        setDeliveries(data.deliveries);
      } catch (err) {
        console.error("Failed to fetch deliveries:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDeliveries();
    const interval = setInterval(fetchDeliveries, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  return (
    <div>
      <h1>Webhook Deliveries</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d: any) => (
              <tr key={d.id}>
                <td>{d.event_type}</td>
                <td>{d.status}</td>
                <td>{d.attempts}</td>
                <td>{new Date(d.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

### Step 10: Test the Migration

1. **Test Session Creation**
   ```bash
   curl -X POST http://localhost:3000/api/whatsapp/sessions \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test Session",
       "countryCode": "BD",
       "phone": "1711111111"
     }'
   ```

2. **Verify Database Entry**
   - Check Supabase dashboard
   - Verify session appears in `whatsapp_sessions` table

3. **Test Webhook Delivery**
   - Set webhook URL to a test endpoint
   - Send a message
   - Verify webhook is called
   - Check `webhook_deliveries` table

4. **Test Webhook Retry**
   - Set webhook URL to invalid endpoint
   - Send a message
   - Verify retry attempts in logs
   - Check delivery status in database

## Rollback Plan

If you need to rollback to the old system:

```bash
# Restore old session manager
rm lib/whatsapp/supabase-session-manager.ts
rm lib/whatsapp/webhook-manager.ts
rm lib/whatsapp/session-manager-enhanced.ts

# Restore old imports in API routes
# (revert changes from Step 5)

# Restore old UI
mv app/app/sessions/new/page.tsx.backup app/app/sessions/new/page.tsx
```

## Data Migration

If you have existing sessions to migrate:

```typescript
// Migration script to import old sessions to database
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function migrateSession(oldSession: any) {
  const { error } = await supabase.from("whatsapp_sessions").insert({
    id: oldSession.id,
    user_id: "migration-user",
    name: oldSession.name,
    phone_number: oldSession.phone,
    status: oldSession.status,
    qr_code: oldSession.qrCode,
    webhook_url: oldSession.webhookUrl,
    created_at: new Date(oldSession.createdAt).toISOString(),
    updated_at: new Date(oldSession.updatedAt).toISOString()
  });

  if (error) {
    console.error("Migration failed:", error);
  }
}
```

## Performance Considerations

### Before Migration
- Sessions only in memory
- No persistence
- Webhook calls synchronous
- No retry logic

### After Migration
- Sessions persisted in database
- Automatic retry with backoff
- Async webhook processing
- Full delivery tracking

### Expected Impact
- Slightly higher latency for session operations (DB query)
- Better reliability for webhook delivery
- Ability to track message history
- Better error handling and debugging

## Monitoring

After migration, monitor:

1. **Database Performance**
   - Query latency
   - Connection pool usage
   - Storage growth

2. **Webhook Delivery**
   - Success rate
   - Average retry attempts
   - Error types

3. **Session Management**
   - Active sessions count
   - Connection stability
   - QR code generation time

## Support

For issues during migration:

1. Check `IMPLEMENTATION_GUIDE.md` for detailed documentation
2. Review error logs in Supabase
3. Check webhook delivery history in database
4. Verify environment variables are set correctly

## Timeline

- **Phase 1**: Backup and preparation (1 hour)
- **Phase 2**: Database setup (30 minutes)
- **Phase 3**: Code updates (2 hours)
- **Phase 4**: Testing (2 hours)
- **Phase 5**: Deployment (1 hour)

**Total: ~6.5 hours**
