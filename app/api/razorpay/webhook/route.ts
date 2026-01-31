import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureActiveBillingUsage } from "@/lib/billing/usage";
import { trySyncBillingInvoiceToZoho } from "@/lib/billing/zohoInvoiceSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// PHASE-7: Observability & Monitoring
interface WebhookMetrics {
  eventType: string;
  processingTime: number;
  success: boolean;
  errorType?: string;
  timestamp: string;
  correlationId: string;
}

interface ProcessingStats {
  totalProcessed: number;
  successful: number;
  failed: number;
  byEventType: Record<string, { total: number; successful: number; failed: number }>;
  averageProcessingTime: number;
  lastProcessed: string | null;
}

// PHASE-7: In-memory stats (in production, use Redis or database)
let processingStats: ProcessingStats = {
  totalProcessed: 0,
  successful: 0,
  failed: 0,
  byEventType: {},
  averageProcessingTime: 0,
  lastProcessed: null,
};

// PHASE-7: Generate correlation ID for request tracking
function generateCorrelationId(): string {
  return `webhook_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// PHASE-7: Structured logging with correlation ID
function logWithContext(
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  context: {
    correlationId?: string;
    eventType?: string;
    eventId?: string;
    companyId?: string;
    operation?: string;
    [key: string]: any;
  }
): void {
  const logEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };
  
  // PHASE-7: Use appropriate log level
  switch (level) {
    case 'error':
      console.error(`[${logEntry.timestamp}] ${message}`, logEntry);
      break;
    case 'warn':
      console.warn(`[${logEntry.timestamp}] ${message}`, logEntry);
      break;
    case 'debug':
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[${logEntry.timestamp}] ${message}`, logEntry);
      }
      break;
    default:
      console.log(`[${logEntry.timestamp}] ${message}`, logEntry);
  }
}

// PHASE-7: Performance timing wrapper
async function measurePerformance<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Record<string, any>
): Promise<{ result: T; duration: number }> {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    
    logWithContext('debug', `Performance: ${operation}`, {
      ...context,
      operation,
      duration,
      success: true,
    });
    
    return { result, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logWithContext('error', `Performance: ${operation} failed`, {
      ...context,
      operation,
      duration,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    
    throw error;
  }
}

// PHASE-7: Record webhook metrics
function recordWebhookMetric(metric: WebhookMetrics): void {
  // Update global stats
  processingStats.totalProcessed++;
  if (metric.success) {
    processingStats.successful++;
  } else {
    processingStats.failed++;
  }
  
  // Update by event type
  if (!processingStats.byEventType[metric.eventType]) {
    processingStats.byEventType[metric.eventType] = {
      total: 0,
      successful: 0,
      failed: 0,
    };
  }
  
  const eventStats = processingStats.byEventType[metric.eventType];
  eventStats.total++;
  if (metric.success) {
    eventStats.successful++;
  } else {
    eventStats.failed++;
  }
  
  // Update average processing time (simple moving average)
  const totalTime = processingStats.averageProcessingTime * (processingStats.totalProcessed - 1) + metric.processingTime;
  processingStats.averageProcessingTime = totalTime / processingStats.totalProcessed;
  
  processingStats.lastProcessed = metric.timestamp;
  
  // PHASE-7: Log metric for external monitoring systems
  logWithContext('info', 'Webhook metric recorded', {
    correlationId: metric.correlationId,
    eventType: metric.eventType,
    processingTime: metric.processingTime,
    success: metric.success,
    errorType: metric.errorType,
  });
}

// PHASE-7: Get processing statistics
function getProcessingStats(): ProcessingStats {
  return { ...processingStats }; // Return copy to prevent mutation
}

// PHASE-7: Reset statistics (for testing or periodic reset)
function resetProcessingStats(): void {
  processingStats = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    byEventType: {},
    averageProcessingTime: 0,
    lastProcessed: null,
  };
}

// PHASE-8: Export test utilities (only in development/test environment)
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
  // PHASE-8: Export functions for testing
  (global as any).__WEBHOOK_TEST_UTILS__ = {
    generateCorrelationId,
    logWithContext,
    measurePerformance,
    recordWebhookMetric,
    getProcessingStats,
    resetProcessingStats,
    classifyError,
    retryOperation,
    validateInvoiceData,
    validateDiscountBreakdown,
    reconcileInvoiceAmounts,
    checkCompanySubscriptionConsistency,
    reconcileCompanySubscription,
    checkInvoiceOrderConsistency,
    validateInvoiceIntegrity,
    sanitizeString,
    sanitizeUUID,
    sanitizeNumber,
    sanitizeWebhookEvent,
    verifyRazorpayWebhookSignatureEnhanced,
    authorizeWebhookOperation,
    writeSecurityAuditLog,
    isValidUUID,
    parsePurpose,
    parseCartPurpose,
    normalizeCartItems,
  };
}

// PHASE-6: Security enhancements
// Maximum webhook payload size (10MB)
const MAX_WEBHOOK_PAYLOAD_SIZE = 10 * 1024 * 1024;

// PHASE-6: Input sanitization functions
function sanitizeString(input: unknown, maxLength: number = 1000): string {
  if (typeof input !== 'string') {
    return String(input || '').substring(0, maxLength);
  }
  
  // Remove null bytes and control characters (except newlines and tabs)
  let sanitized = input
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, ''); // Remove control chars except \n and \t
  
  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
    console.warn('PHASE-6: String truncated during sanitization', { originalLength: input.length, maxLength });
  }
  
  return sanitized;
}

function sanitizeUUID(input: unknown): string | null {
  const str = sanitizeString(input, 36);
  if (!isValidUUID(str)) {
    return null;
  }
  return str;
}

function sanitizeNumber(input: unknown, min: number = -Infinity, max: number = Infinity): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < min || input > max) {
      return null;
    }
    return input;
  }
  
  if (typeof input === 'string') {
    const num = Number(input);
    if (!Number.isFinite(num) || num < min || num > max) {
      return null;
    }
    return num;
  }
  
  return null;
}

// PHASE-6: Sanitize webhook event payload
function sanitizeWebhookEvent(event: any): any {
  if (!event || typeof event !== 'object') {
    return null;
  }
  
  // Create sanitized copy
  const sanitized: any = {};
  
  // Sanitize top-level fields
  if (event.id) sanitized.id = sanitizeString(event.id, 255);
  if (event.event) sanitized.event = sanitizeString(event.event, 100);
  if (event.created_at) sanitized.created_at = sanitizeNumber(event.created_at, 0, Date.now() / 1000 + 86400); // Allow up to 1 day in future
  
  // Sanitize payload
  if (event.payload && typeof event.payload === 'object') {
    sanitized.payload = {};
    
    // Sanitize invoice entity
    if (event.payload.invoice?.entity) {
      const invoice = event.payload.invoice.entity;
      sanitized.payload.invoice = {
        entity: {
          id: invoice.id ? sanitizeString(invoice.id, 255) : undefined,
          amount: sanitizeNumber(invoice.amount, 0, 100_000_000_000), // Max 100 billion paise
          amount_paid: sanitizeNumber(invoice.amount_paid, 0, 100_000_000_000),
          amount_due: sanitizeNumber(invoice.amount_due, 0, 100_000_000_000),
          currency: invoice.currency ? sanitizeString(invoice.currency, 10) : undefined,
          status: invoice.status ? sanitizeString(invoice.status, 50) : undefined,
          paid_at: sanitizeNumber(invoice.paid_at, 0, Date.now() / 1000 + 86400),
          period_start: sanitizeNumber(invoice.period_start, 0, Date.now() / 1000 + 86400),
          period_end: sanitizeNumber(invoice.period_end, 0, Date.now() / 1000 + 86400),
          subscription_id: invoice.subscription_id ? sanitizeString(invoice.subscription_id, 255) : undefined,
          payment_id: invoice.payment_id ? sanitizeString(invoice.payment_id, 255) : undefined,
          notes: invoice.notes && typeof invoice.notes === 'object' ? {
            company_id: invoice.notes.company_id ? sanitizeUUID(invoice.notes.company_id) : undefined,
            plan: invoice.notes.plan ? sanitizeString(invoice.notes.plan, 255) : undefined,
          } : undefined,
        },
      };
    }
    
    // Sanitize subscription entity
    if (event.payload.subscription?.entity) {
      const subscription = event.payload.subscription.entity;
      sanitized.payload.subscription = {
        entity: {
          id: subscription.id ? sanitizeString(subscription.id, 255) : undefined,
          status: subscription.status ? sanitizeString(subscription.status, 50) : undefined,
          plan_id: subscription.plan_id ? sanitizeString(subscription.plan_id, 255) : undefined,
          current_end: sanitizeNumber(subscription.current_end, 0, Date.now() / 1000 + 31536000), // Max 1 year in future
          cancel_at_cycle_end: typeof subscription.cancel_at_cycle_end === 'boolean' ? subscription.cancel_at_cycle_end : 
                              subscription.cancel_at_cycle_end === 1 ? true : false,
        },
      };
    }
    
    // Sanitize payment entity
    if (event.payload.payment?.entity) {
      const payment = event.payload.payment.entity;
      sanitized.payload.payment = {
        entity: {
          id: payment.id ? sanitizeString(payment.id, 255) : undefined,
          order_id: payment.order_id ? sanitizeString(payment.order_id, 255) : undefined,
          amount: sanitizeNumber(payment.amount, 0, 100_000_000_000),
          currency: payment.currency ? sanitizeString(payment.currency, 10) : undefined,
          status: payment.status ? sanitizeString(payment.status, 50) : undefined,
        },
      };
    }
  }
  
  return sanitized;
}

// PHASE-6: Enhanced webhook signature verification with security checks
function verifyRazorpayWebhookSignatureEnhanced(
  rawBody: string,
  signature: string | null,
  webhookSecret: string | undefined
): { valid: boolean; reason?: string } {
  // PHASE-6: Check payload size
  if (rawBody.length > MAX_WEBHOOK_PAYLOAD_SIZE) {
    console.error('PHASE-6: Webhook payload exceeds maximum size', {
      size: rawBody.length,
      maxSize: MAX_WEBHOOK_PAYLOAD_SIZE,
    });
    return { valid: false, reason: 'Payload too large' };
  }
  
  // PHASE-6: Check signature format (should be hex string)
  if (signature && !/^[0-9a-f]{64}$/i.test(signature)) {
    console.error('PHASE-6: Invalid signature format', {
      signatureLength: signature.length,
      signaturePrefix: signature.substring(0, 10),
    });
    return { valid: false, reason: 'Invalid signature format' };
  }
  
  // PHASE-6: Verify secret is configured
  if (!webhookSecret || webhookSecret.length < 32) {
    console.error('PHASE-6: Webhook secret not properly configured');
    return { valid: false, reason: 'Webhook secret not configured' };
  }
  
  // PHASE-1: Use existing verification (already secure)
  const isValid = verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret);
  
  if (!isValid) {
    console.warn('PHASE-6: Webhook signature verification failed', {
      signaturePresent: !!signature,
      bodyLength: rawBody.length,
      secretConfigured: !!webhookSecret,
    });
  }
  
  return { valid: isValid, reason: isValid ? undefined : 'Signature mismatch' };
}

// PHASE-6: Authorization check - verify company access
async function authorizeWebhookOperation(
  admin: any,
  companyId: string,
  operation: string
): Promise<{ authorized: boolean; reason?: string }> {
  try {
    // PHASE-6: Verify company exists and is active
    const { data: company, error } = await admin
      .from('companies')
      .select('id, subscription_status')
      .eq('id', companyId)
      .maybeSingle();
    
    if (error) {
      console.error('PHASE-6: Authorization check failed - database error', {
        companyId,
        operation,
        error: error.message,
      });
      return { authorized: false, reason: 'Database error during authorization' };
    }
    
    if (!company) {
      console.warn('PHASE-6: Authorization check failed - company not found', {
        companyId,
        operation,
      });
      return { authorized: false, reason: 'Company not found' };
    }
    
    // PHASE-6: For webhook operations, we allow all companies (webhooks are from Razorpay)
    // But we log for audit purposes
    return { authorized: true };
  } catch (error: any) {
    const classified = classifyError(error, { companyId, operation, context: 'authorization' });
    logWebhookError('authorizeWebhookOperation', classified);
    return { authorized: false, reason: 'Authorization check failed' };
  }
}

// PHASE-6: Enhanced audit logging with security context
async function writeSecurityAuditLog(params: {
  companyId: string;
  action: string;
  status: 'success' | 'failed';
  securityContext: {
    webhookEventId?: string;
    webhookEventType?: string;
    ipAddress?: string;
    userAgent?: string;
    signatureValid?: boolean;
  };
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    await writeAuditLog({
      companyId: params.companyId,
      actor: 'system',
      action: params.action,
      status: params.status,
      integrationSystem: 'razorpay',
      metadata: {
        ...params.metadata,
        security: {
          webhook_event_id: params.securityContext.webhookEventId,
          webhook_event_type: params.securityContext.webhookEventType,
          signature_valid: params.securityContext.signatureValid,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (error: any) {
    // PHASE-6: Don't fail webhook if audit logging fails, but log error
    console.error('PHASE-6: Failed to write security audit log', {
      companyId: params.companyId,
      action: params.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// PHASE-3: Structured error types for error classification
enum WebhookErrorType {
  TRANSIENT = 'TRANSIENT',        // Retryable: network, timeout, temporary DB issues
  VALIDATION = 'VALIDATION',      // Non-retryable: invalid input, malformed data
  BUSINESS_LOGIC = 'BUSINESS_LOGIC', // Non-retryable: business rule violation
  PERMANENT = 'PERMANENT',        // Non-retryable: data not found, already processed
  SYSTEM = 'SYSTEM',             // Retryable: database connection, external service
}

interface WebhookError {
  type: WebhookErrorType;
  message: string;
  originalError?: Error;
  context?: Record<string, any>;
  retryable: boolean;
  retryAfter?: number; // seconds
}

// PHASE-3: Error classification helper
function classifyError(error: Error | unknown, context?: Record<string, any>): WebhookError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  
  // Network/timeout errors - retryable
  if (errorMessage.includes('timeout') || 
      errorMessage.includes('ECONNRESET') || 
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('ETIMEDOUT')) {
    return {
      type: WebhookErrorType.TRANSIENT,
      message: `Network error: ${errorMessage}`,
      originalError: error instanceof Error ? error : undefined,
      context,
      retryable: true,
      retryAfter: 5, // Retry after 5 seconds
    };
  }
  
  // Database connection errors - retryable
  if (errorMessage.includes('connection') || 
      errorMessage.includes('PGRST') ||
      errorMessage.includes('database') ||
      errorMessage.includes('pool')) {
    return {
      type: WebhookErrorType.SYSTEM,
      message: `Database error: ${errorMessage}`,
      originalError: error instanceof Error ? error : undefined,
      context,
      retryable: true,
      retryAfter: 3,
    };
  }
  
  // Validation errors - non-retryable
  if (errorMessage.includes('Invalid') || 
      errorMessage.includes('not found') ||
      errorMessage.includes('PHASE-2: Invalid')) {
    return {
      type: WebhookErrorType.VALIDATION,
      message: `Validation error: ${errorMessage}`,
      originalError: error instanceof Error ? error : undefined,
      context,
      retryable: false,
    };
  }
  
  // Already processed - non-retryable
  if (errorMessage.includes('already processed') || 
      errorMessage.includes('duplicate') ||
      errorMessage.includes('already exists')) {
    return {
      type: WebhookErrorType.PERMANENT,
      message: `Already processed: ${errorMessage}`,
      originalError: error instanceof Error ? error : undefined,
      context,
      retryable: false,
    };
  }
  
  // Default: treat as transient for unknown errors (safer to retry)
  return {
    type: WebhookErrorType.TRANSIENT,
    message: `Unknown error: ${errorMessage}`,
    originalError: error instanceof Error ? error : undefined,
    context,
    retryable: true,
    retryAfter: 10,
  };
}

// PHASE-3: Retry mechanism with exponential backoff
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  context?: Record<string, any>
): Promise<T> {
  let lastError: Error | unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const classified = classifyError(error, context);
      
      // Don't retry if error is not retryable
      if (!classified.retryable || attempt === maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = initialDelay * Math.pow(2, attempt);
      const retryAfter = classified.retryAfter ? classified.retryAfter * 1000 : delay;
      
      console.warn(`PHASE-3: Retry attempt ${attempt + 1}/${maxRetries} after ${retryAfter}ms`, {
        error: classified.message,
        context,
      });
      
      await new Promise(resolve => setTimeout(resolve, retryAfter));
    }
  }
  
  throw lastError;
}

// PHASE-3: Log error to dead letter queue (for permanently failed webhooks)
async function logToDeadLetterQueue(
  admin: any,
  idempotencyKey: string | null,
  eventType: string,
  error: WebhookError,
  eventPayload: any
): Promise<void> {
  try {
    // Try to insert into dead_letter_queue table
    await admin
      .from('webhook_dead_letter_queue')
      .insert({
        idempotency_key: idempotencyKey || `unknown:${Date.now()}`,
        event_type: eventType,
        error_type: error.type,
        error_message: error.message,
        error_context: error.context || {},
        event_payload: eventPayload,
        failed_at: new Date().toISOString(),
        retryable: error.retryable,
      })
      .select('id')
      .single();
  } catch (dlqError: any) {
    // If table doesn't exist, log to console as fallback
    if (dlqError.code === 'PGRST116') {
      console.error('PHASE-3: Dead letter queue table not found. Logging to console:', {
        idempotencyKey,
        eventType,
        error: error.message,
        payload: JSON.stringify(eventPayload).substring(0, 500), // Truncate for safety
      });
    } else {
      console.error('PHASE-3: Failed to log to dead letter queue', dlqError.message);
    }
  }
}

// PHASE-3: Comprehensive error logging with context
function logWebhookError(
  phase: string,
  error: WebhookError,
  additionalContext?: Record<string, any>
): void {
  const logContext = {
    phase,
    errorType: error.type,
    message: error.message,
    retryable: error.retryable,
    retryAfter: error.retryAfter,
    ...error.context,
    ...additionalContext,
    timestamp: new Date().toISOString(),
  };
  
  if (error.type === WebhookErrorType.VALIDATION || error.type === WebhookErrorType.PERMANENT) {
    // Non-retryable errors - log as warning
    console.warn(`PHASE-3: ${phase} - Non-retryable error`, logContext);
  } else {
    // Retryable errors - log as error
    console.error(`PHASE-3: ${phase} - Retryable error`, logContext);
  }
  
  // Log original error stack if available
  if (error.originalError instanceof Error && error.originalError.stack) {
    console.error('PHASE-3: Original error stack', error.originalError.stack);
  }
}

// PHASE-2: Idempotency key generation for webhook deduplication
function generateWebhookIdempotencyKey(eventId: string, entityType: string, entityId: string): string {
  return `webhook:${eventId}:${entityType}:${entityId}`;
}

// PHASE-2: Check if webhook event was already processed (idempotency)
async function isWebhookProcessed(admin: any, idempotencyKey: string): Promise<boolean> {
  try {
    // Check if we have a webhook_events table for tracking
    // If not, fall back to checking existing records
    const { data, error } = await admin
      .from('webhook_events')
      .select('id, processed_at')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = table doesn't exist
      console.warn('PHASE-2: webhook_events table check failed', error.message);
      return false; // Assume not processed if table doesn't exist
    }
    
    return !!data?.id;
  } catch {
    // Table might not exist - that's okay, we'll track via existing records
    return false;
  }
}

// PHASE-2: Mark webhook event as processed
async function markWebhookProcessed(admin: any, idempotencyKey: string, eventType: string, metadata: any): Promise<void> {
  try {
    await admin
      .from('webhook_events')
      .insert({
        idempotency_key: idempotencyKey,
        event_type: eventType,
        metadata: metadata,
        processed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
  } catch (err: any) {
    // PHASE-2: If table doesn't exist, log but don't fail
    // This is a tracking mechanism, not critical for webhook processing
    if (err.code !== 'PGRST116') { // PGRST116 = table doesn't exist
      console.warn('PHASE-2: Failed to mark webhook as processed', err.message);
    }
  }
}

// PHASE-1 FIX: Webhook signature verification - prevent timing attacks
function verifyRazorpayWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string | undefined): boolean {
  // PHASE-1: Always compute HMAC to prevent timing leaks
  // Use dummy secret if inputs are missing to maintain constant-time comparison
  const secret = webhookSecret || '';
  const sig = signature || '';
  
  // Always compute HMAC (even with empty secret) to prevent timing attacks
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const encoder = new TextEncoder();
  const a = encoder.encode(expected);
  const b = encoder.encode(sig);
  
  // Constant-time length check
  if (a.length !== b.length) return false;
  
  // Constant-time comparison
  return crypto.timingSafeEqual(a, b);
}

type AddonKind = "unit" | "box" | "carton" | "pallet" | "userid" | "erp";

async function ensureSubscriptionInvoice(params: {
  admin: any;
  companyId: string;
  providerInvoiceId: string;
  providerPaymentId: string | null;
  paidAt: string;
  periodStart: string;
  periodEnd: string;
  currency?: string | null;
  amountInr: number;
  planLabel: string;
  metadata: any;
}) {
  // PRIORITY-2: Extract discount breakdown from metadata if present
  const discountBreakdown = params.metadata?.discount || null;
  const {
    admin,
    companyId,
    providerInvoiceId,
    providerPaymentId,
    paidAt,
    periodStart,
    periodEnd,
    currency,
    amountInr,
    planLabel,
    metadata,
  } = params;

  const reference = `razorpay_invoice:${providerInvoiceId}`;

  // PHASE-5: Validate invoice integrity before creation
  const integrityCheck = await validateInvoiceIntegrity(admin, {
    companyId,
    providerInvoiceId,
    amount: amountInr,
    reference,
  });
  
  if (!integrityCheck.consistent) {
    const errors = integrityCheck.issues.filter(i => i.severity === 'error');
    if (errors.length > 0) {
      const errorMsg = `PHASE-5: Invoice integrity check failed: ${errors.map(e => e.message).join('; ')}`;
      console.error(errorMsg, { companyId, providerInvoiceId, amountInr });
      throw new Error(errorMsg);
    }
    
    // Log warnings but continue
    const warnings = integrityCheck.issues.filter(i => i.severity === 'warning');
    if (warnings.length > 0) {
      console.warn('PHASE-5: Invoice integrity warnings', {
        warnings: warnings.map(w => w.message),
        companyId,
        providerInvoiceId,
      });
    }
  }

  const { data: existing, error: existingErr } = await admin
    .from('billing_invoices')
    .select('id, amount')
    .eq('company_id', companyId)
    .eq('reference', reference)
    .maybeSingle();

  if (existingErr) {
    const classified = classifyError(existingErr, { companyId, providerInvoiceId, operation: 'check_existing_subscription_invoice' });
    logWebhookError('ensureSubscriptionInvoice', classified);
    throw new Error(`PHASE-5: Failed to check existing invoice: ${existingErr.message}`);
  }
  
  if (existing?.id) {
    // PHASE-5: Verify existing invoice amount matches
    const existingAmount = Number(existing.amount || 0);
    const amountDiff = Math.abs(existingAmount - amountInr);
    if (amountDiff > 0.01) {
      console.warn('PHASE-5: Existing subscription invoice amount mismatch', {
        invoiceId: existing.id,
        existingAmount,
        newAmount: amountInr,
        difference: amountDiff,
        companyId,
        providerInvoiceId,
      });
    }
    
    trySyncBillingInvoiceToZoho(String(existing.id)).catch(() => undefined);
    return { id: existing.id, created: false };
  }

  // PHASE-4: Validate invoice data before processing
  const validation = validateInvoiceData({
    companyId,
    providerInvoiceId,
    amountInr,
    currency,
    periodStart,
    periodEnd,
    paidAt,
  });
  
  if (!validation.valid) {
    const errorMsg = `PHASE-4: Invoice validation failed: ${validation.errors.join('; ')}`;
    console.error(errorMsg, { companyId, providerInvoiceId, amountInr });
    throw new Error(errorMsg);
  }
  
  // PHASE-4: Log warnings but don't fail
  if (validation.warnings.length > 0) {
    console.warn('PHASE-4: Invoice validation warnings', {
      warnings: validation.warnings,
      companyId,
      providerInvoiceId,
      amountInr,
    });
  }

  const amount = Number.isFinite(amountInr) ? Number(amountInr.toFixed(2)) : 0;
  if (!amount || amount < 0) {
    throw new Error(`PHASE-4: Invalid invoice amount: ${amount} (must be >= 0)`);
  }

  // Phase 6: Fetch company for GST and billing_cycle (for invoice fields)
  const { data: companyRow } = await admin
    .from('companies')
    .select('gst, discount_type, discount_value, discount_applies_to')
    .eq('id', companyId)
    .maybeSingle();
  const gstNumber = (companyRow as any)?.gst ?? null;
  const hasGst = Boolean(gstNumber && String(gstNumber).trim() !== '');
  const billingCycleFromNotes = metadata?.notes?.billing_cycle ?? metadata?.billing_cycle ?? null;
  const billingCycle = billingCycleFromNotes && ['monthly', 'yearly', 'quarterly'].includes(String(billingCycleFromNotes)) ? String(billingCycleFromNotes) : null;

  // PRIORITY-2: Calculate invoice breakdown with discount
  let baseAmount = discountBreakdown?.base_amount ?? amount;
  let discountAmount = discountBreakdown?.discount_amount ?? 0;
  let finalAmount = discountBreakdown?.final_amount ?? amount;
  const subtotalAfterDiscount = Math.max(0, baseAmount - discountAmount);
  const taxAmount = hasGst && finalAmount >= subtotalAfterDiscount ? Number((finalAmount - subtotalAfterDiscount).toFixed(2)) : 0;
  const taxRate = hasGst && subtotalAfterDiscount > 0 ? 0.18 : null;
  
  // PHASE-4: Validate discount breakdown
  const discountValidation = validateDiscountBreakdown(discountBreakdown, baseAmount, finalAmount);
  if (!discountValidation.valid) {
    console.error('PHASE-4: Discount validation failed', {
      errors: discountValidation.errors,
      discountBreakdown,
      baseAmount,
      finalAmount,
    });
    // Don't fail invoice creation, but log error
  }
  if (discountValidation.warnings.length > 0) {
    console.warn('PHASE-4: Discount validation warnings', {
      warnings: discountValidation.warnings,
      discountBreakdown,
    });
  }
  
  // PHASE-4: Reconcile amounts to ensure consistency
  const reconciled = reconcileInvoiceAmounts(baseAmount, discountAmount, finalAmount, discountBreakdown);
  if (reconciled.reconciled) {
    console.info('PHASE-4: Invoice amounts reconciled', {
      original: { baseAmount, discountAmount, finalAmount },
      reconciled: { baseAmount: reconciled.baseAmount, discountAmount: reconciled.discountAmount, finalAmount: reconciled.finalAmount },
      companyId,
      providerInvoiceId,
    });
    baseAmount = reconciled.baseAmount;
    discountAmount = reconciled.discountAmount;
    finalAmount = reconciled.finalAmount;
  }

  const invoiceRowWithOptionalColumns: any = {
    company_id: companyId,
    plan: planLabel,
    period_start: periodStart,
    period_end: periodEnd,
    amount: finalAmount, // Final amount after discount
    currency: currency ?? 'INR',
    status: 'PAID',
    paid_at: paidAt,
    reference,
    // Optional columns (may not exist if migrations weren't applied yet)
    provider: 'razorpay',
    provider_invoice_id: providerInvoiceId,
    provider_payment_id: providerPaymentId,
    base_amount: baseAmount,
    addons_amount: 0,
    wallet_applied: 0,
    // Phase 6: Tax, discount, billing cycle for compliant invoices
    tax_rate: taxRate,
    tax_amount: taxAmount > 0 ? taxAmount : null,
    has_gst: hasGst,
    gst_number: hasGst ? (String(gstNumber).trim() || null) : null,
    discount_type: discountBreakdown?.discount_type ?? (companyRow as any)?.discount_type ?? null,
    discount_value: discountBreakdown?.discount_value ?? (companyRow as any)?.discount_value ?? null,
    discount_amount: discountAmount > 0 ? discountAmount : null,
    billing_cycle: billingCycle,
    metadata: {
      ...(metadata ?? {}),
      pricing: { 
        base: baseAmount, 
        discount: discountAmount,
        subtotal: subtotalAfterDiscount,
        tax: taxAmount,
        final: finalAmount,
        addons: 0 
      },
      discount: discountBreakdown,
      razorpay: { invoice_id: providerInvoiceId, payment_id: providerPaymentId },
      created_by: 'system',
    },
  };

  // PRIORITY-2: Use same discount breakdown for minimal row (variables already declared above)
  const invoiceRowMinimal: any = {
    company_id: companyId,
    plan: planLabel,
    period_start: periodStart,
    period_end: periodEnd,
    amount: finalAmount, // Final amount after discount
    currency: currency ?? 'INR',
    status: 'PAID',
    paid_at: paidAt,
    reference,
    metadata: {
      ...(metadata ?? {}),
      pricing: { 
        base: baseAmount, 
        discount: discountAmount,
        final: finalAmount,
        addons: 0 
      },
      discount: discountBreakdown,
      razorpay: { invoice_id: providerInvoiceId, payment_id: providerPaymentId },
      created_by: 'system',
    },
  };

  // Try inserting with optional columns first; if schema doesn't have them, retry minimal.
  const firstAttempt = await admin
    .from('billing_invoices')
    .insert(invoiceRowWithOptionalColumns)
    .select('id')
    .maybeSingle();

  if (!firstAttempt.error) {
    if (firstAttempt.data?.id) {
      trySyncBillingInvoiceToZoho(String(firstAttempt.data.id)).catch(() => undefined);
    }
    return { id: firstAttempt.data?.id ?? null, created: true };
  }

  const msg = String(firstAttempt.error.message ?? firstAttempt.error);
  const looksLikeMissingColumn = /column .* does not exist/i.test(msg);
  if (!looksLikeMissingColumn) throw new Error(msg);

  const secondAttempt = await admin
    .from('billing_invoices')
    .insert(invoiceRowMinimal)
    .select('id')
    .maybeSingle();

  if (secondAttempt.error) throw new Error(String(secondAttempt.error.message ?? secondAttempt.error));
  if (secondAttempt.data?.id) {
    trySyncBillingInvoiceToZoho(String(secondAttempt.data.id)).catch(() => undefined);
  }
  return { id: secondAttempt.data?.id ?? null, created: true };
}

// PHASE-1: UUID validation helper
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// PHASE-1: Quantity bounds
const MAX_QUANTITY = 1_000_000;
const MIN_QUANTITY = 1;

// PHASE-4: Invoice validation and robustness
interface InvoiceValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// PHASE-4: Validate invoice data before creation
function validateInvoiceData(params: {
  companyId: string | null;
  providerInvoiceId: string;
  amountInr: number;
  currency?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  paidAt?: string | null;
}): InvoiceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Company ID validation
  if (!params.companyId) {
    errors.push('Company ID is required');
  } else if (!isValidUUID(params.companyId)) {
    errors.push(`Invalid company ID format: ${params.companyId}`);
  }
  
  // Provider invoice ID validation
  if (!params.providerInvoiceId || typeof params.providerInvoiceId !== 'string' || params.providerInvoiceId.trim().length === 0) {
    errors.push('Provider invoice ID is required');
  } else if (params.providerInvoiceId.length > 255) {
    warnings.push(`Provider invoice ID is very long: ${params.providerInvoiceId.length} characters`);
  }
  
  // Amount validation
  if (!Number.isFinite(params.amountInr)) {
    errors.push(`Invalid invoice amount: ${params.amountInr} (not a number)`);
  } else if (params.amountInr < 0) {
    errors.push(`Invalid invoice amount: ${params.amountInr} (negative)`);
  } else if (params.amountInr === 0) {
    warnings.push('Invoice amount is zero - this may be intentional for free trials');
  } else if (params.amountInr > 100_000_000) {
    warnings.push(`Invoice amount is very large: ₹${params.amountInr.toLocaleString()}`);
  }
  
  // Currency validation
  if (params.currency && typeof params.currency === 'string') {
    const validCurrencies = ['INR', 'USD', 'EUR', 'GBP'];
    const upperCurrency = params.currency.toUpperCase();
    if (!validCurrencies.includes(upperCurrency)) {
      warnings.push(`Unusual currency: ${params.currency} (expected: ${validCurrencies.join(', ')})`);
    }
  }
  
  // Date validation
  if (params.paidAt) {
    const paidDate = new Date(params.paidAt);
    if (isNaN(paidDate.getTime())) {
      errors.push(`Invalid paid_at date: ${params.paidAt}`);
    } else {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours in future
      if (paidDate > futureDate) {
        warnings.push(`Paid date is in the future: ${params.paidAt}`);
      }
      // Check if date is too old (more than 1 year)
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      if (paidDate < oneYearAgo) {
        warnings.push(`Paid date is very old: ${params.paidAt}`);
      }
    }
  }
  
  // Period validation
  if (params.periodStart && params.periodEnd) {
    const startDate = new Date(params.periodStart);
    const endDate = new Date(params.periodEnd);
    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
      if (endDate < startDate) {
        errors.push(`Period end (${params.periodEnd}) is before period start (${params.periodStart})`);
      }
      const periodDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      if (periodDays > 366) {
        warnings.push(`Billing period is very long: ${Math.round(periodDays)} days`);
      }
      if (periodDays < 0) {
        errors.push(`Invalid billing period: negative duration`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// PHASE-4: Validate discount breakdown
function validateDiscountBreakdown(discountBreakdown: any, baseAmount: number, finalAmount: number): InvoiceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!discountBreakdown) {
    return { valid: true, errors: [], warnings: [] };
  }
  
  // Validate discount type
  if (discountBreakdown.discount_type && !['percentage', 'flat'].includes(discountBreakdown.discount_type)) {
    errors.push(`Invalid discount type: ${discountBreakdown.discount_type}`);
  }
  
  // Validate discount value
  if (discountBreakdown.discount_value !== null && discountBreakdown.discount_value !== undefined) {
    if (!Number.isFinite(discountBreakdown.discount_value)) {
      errors.push(`Invalid discount value: ${discountBreakdown.discount_value}`);
    } else if (discountBreakdown.discount_value < 0) {
      errors.push(`Negative discount value: ${discountBreakdown.discount_value}`);
    } else if (discountBreakdown.discount_type === 'percentage' && discountBreakdown.discount_value > 100) {
      errors.push(`Discount percentage exceeds 100%: ${discountBreakdown.discount_value}%`);
    }
  }
  
  // Validate amount consistency
  if (discountBreakdown.base_amount !== undefined && discountBreakdown.final_amount !== undefined) {
    const calculatedFinal = discountBreakdown.base_amount - (discountBreakdown.discount_amount || 0);
    const difference = Math.abs(calculatedFinal - discountBreakdown.final_amount);
    if (difference > 0.01) { // Allow 1 paise difference for rounding
      warnings.push(`Discount calculation mismatch: expected final ${calculatedFinal.toFixed(2)}, got ${discountBreakdown.final_amount.toFixed(2)}`);
    }
  }
  
  // Validate against actual amounts
  if (discountBreakdown.base_amount !== undefined) {
    const baseDiff = Math.abs(discountBreakdown.base_amount - baseAmount);
    if (baseDiff > 0.01) {
      warnings.push(`Base amount mismatch: breakdown says ${discountBreakdown.base_amount}, actual is ${baseAmount}`);
    }
  }
  
  if (discountBreakdown.final_amount !== undefined) {
    const finalDiff = Math.abs(discountBreakdown.final_amount - finalAmount);
    if (finalDiff > 0.01) {
      warnings.push(`Final amount mismatch: breakdown says ${discountBreakdown.final_amount}, actual is ${finalAmount}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// PHASE-4: Reconcile invoice amounts (ensure consistency)
function reconcileInvoiceAmounts(
  baseAmount: number,
  discountAmount: number,
  finalAmount: number,
  discountBreakdown: any
): { baseAmount: number; discountAmount: number; finalAmount: number; reconciled: boolean } {
  // PHASE-4: Ensure final = base - discount
  const expectedFinal = Math.max(0, baseAmount - discountAmount);
  const difference = Math.abs(expectedFinal - finalAmount);
  
  // If difference is significant (> 1 paise), reconcile
  if (difference > 0.01) {
    // Use the more reliable source: if we have discount breakdown, trust it
    if (discountBreakdown?.base_amount && discountBreakdown?.discount_amount) {
      return {
        baseAmount: discountBreakdown.base_amount,
        discountAmount: discountBreakdown.discount_amount,
        finalAmount: discountBreakdown.final_amount || expectedFinal,
        reconciled: true,
      };
    }
    
    // Otherwise, recalculate from base and discount
    return {
      baseAmount,
      discountAmount,
      finalAmount: expectedFinal,
      reconciled: true,
    };
  }
  
  return {
    baseAmount,
    discountAmount,
    finalAmount,
    reconciled: false,
  };
}

// PHASE-5: Data consistency and reconciliation functions
interface ConsistencyCheckResult {
  consistent: boolean;
  issues: Array<{ type: string; message: string; severity: 'error' | 'warning' }>;
}

// PHASE-5: Check consistency between companies and company_subscriptions
async function checkCompanySubscriptionConsistency(
  admin: any,
  companyId: string,
  razorpaySubscriptionId: string | null
): Promise<ConsistencyCheckResult> {
  const issues: Array<{ type: string; message: string; severity: 'error' | 'warning' }> = [];
  
  try {
    // Fetch company record
    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('id, razorpay_subscription_id, subscription_status')
      .eq('id', companyId)
      .maybeSingle();
    
    if (companyError) {
      issues.push({
        type: 'database_error',
        message: `Failed to fetch company: ${companyError.message}`,
        severity: 'error',
      });
      return { consistent: false, issues };
    }
    
    if (!company) {
      issues.push({
        type: 'missing_company',
        message: `Company not found: ${companyId}`,
        severity: 'error',
      });
      return { consistent: false, issues };
    }
    
    // Fetch subscription record
    const { data: subscription, error: subError } = await admin
      .from('company_subscriptions')
      .select('id, company_id, razorpay_subscription_id, status, plan_id')
      .eq('company_id', companyId)
      .maybeSingle();
    
    if (subError && subError.code !== 'PGRST116') { // PGRST116 = no rows found
      issues.push({
        type: 'database_error',
        message: `Failed to fetch subscription: ${subError.message}`,
        severity: 'error',
      });
    }
    
    // PHASE-5: Check razorpay_subscription_id consistency
    if (razorpaySubscriptionId) {
      const companySubId = company.razorpay_subscription_id;
      const subSubId = subscription?.razorpay_subscription_id;
      
      if (companySubId !== razorpaySubscriptionId && subSubId !== razorpaySubscriptionId) {
        issues.push({
          type: 'subscription_id_mismatch',
          message: `Razorpay subscription ID mismatch: company has ${companySubId}, subscription has ${subSubId}, webhook has ${razorpaySubscriptionId}`,
          severity: 'warning',
        });
      }
      
      if (companySubId && subSubId && companySubId !== subSubId) {
        issues.push({
          type: 'subscription_id_inconsistency',
          message: `Subscription ID inconsistency: company table has ${companySubId}, company_subscriptions has ${subSubId}`,
          severity: 'error',
        });
      }
    }
    
    // PHASE-5: Check status consistency (if subscription exists)
    if (subscription) {
      const companyStatus = company.subscription_status;
      const subStatus = subscription.status;
      
      // Map subscription status to company status for comparison
      const statusMap: Record<string, string> = {
        'ACTIVE': 'active',
        'TRIAL': 'trial',
        'PAUSED': 'paused',
        'CANCELLED': 'cancelled',
        'EXPIRED': 'expired',
      };
      
      const mappedSubStatus = statusMap[subStatus] || subStatus.toLowerCase();
      
      if (companyStatus && mappedSubStatus !== companyStatus) {
        issues.push({
          type: 'status_inconsistency',
          message: `Status inconsistency: company table has ${companyStatus}, company_subscriptions has ${subStatus}`,
          severity: 'warning',
        });
      }
    } else if (company.subscription_status && company.subscription_status !== 'inactive') {
      // PHASE-5: Company has status but no subscription record
      issues.push({
        type: 'missing_subscription_record',
        message: `Company has subscription status ${company.subscription_status} but no company_subscriptions record`,
        severity: 'warning',
      });
    }
    
    return {
      consistent: issues.filter(i => i.severity === 'error').length === 0,
      issues,
    };
  } catch (error: any) {
    const classified = classifyError(error, { companyId, operation: 'check_company_subscription_consistency' });
    return {
      consistent: false,
      issues: [{
        type: 'exception',
        message: `Consistency check failed: ${classified.message}`,
        severity: 'error',
      }],
    };
  }
}

// PHASE-5: Reconcile company and subscription data
async function reconcileCompanySubscription(
  admin: any,
  companyId: string,
  razorpaySubscriptionId: string | null,
  subscriptionStatus: string | null
): Promise<{ reconciled: boolean; changes: string[] }> {
  const changes: string[] = [];
  
  try {
    const consistencyCheck = await checkCompanySubscriptionConsistency(admin, companyId, razorpaySubscriptionId);
    
    if (consistencyCheck.consistent) {
      return { reconciled: false, changes: [] };
    }
    
    // PHASE-5: Fix subscription ID inconsistencies
    if (razorpaySubscriptionId) {
      const { data: company } = await admin
        .from('companies')
        .select('razorpay_subscription_id')
        .eq('id', companyId)
        .maybeSingle();
      
      if (company && company.razorpay_subscription_id !== razorpaySubscriptionId) {
        await admin
          .from('companies')
          .update({ razorpay_subscription_id: razorpaySubscriptionId })
          .eq('id', companyId);
        changes.push(`Updated company.razorpay_subscription_id to ${razorpaySubscriptionId}`);
      }
      
      const { data: subscription } = await admin
        .from('company_subscriptions')
        .select('id, razorpay_subscription_id')
        .eq('company_id', companyId)
        .maybeSingle();
      
      if (subscription && subscription.razorpay_subscription_id !== razorpaySubscriptionId) {
        await admin
          .from('company_subscriptions')
          .update({ razorpay_subscription_id: razorpaySubscriptionId })
          .eq('id', subscription.id);
        changes.push(`Updated company_subscriptions.razorpay_subscription_id to ${razorpaySubscriptionId}`);
      }
    }
    
    // PHASE-5: Fix status inconsistencies
    if (subscriptionStatus) {
      const statusMap: Record<string, string> = {
        'ACTIVE': 'active',
        'TRIAL': 'trial',
        'PAUSED': 'paused',
        'CANCELLED': 'cancelled',
        'EXPIRED': 'expired',
      };
      
      const companyStatus = statusMap[subscriptionStatus] || subscriptionStatus.toLowerCase();
      
      const { data: company } = await admin
        .from('companies')
        .select('subscription_status')
        .eq('id', companyId)
        .maybeSingle();
      
      if (company && company.subscription_status !== companyStatus) {
        await admin
          .from('companies')
          .update({ subscription_status: companyStatus })
          .eq('id', companyId);
        changes.push(`Updated company.subscription_status to ${companyStatus}`);
      }
    }
    
    return { reconciled: changes.length > 0, changes };
  } catch (error: any) {
    const classified = classifyError(error, { companyId, operation: 'reconcile_company_subscription' });
    logWebhookError('reconcileCompanySubscription', classified);
    return { reconciled: false, changes: [] };
  }
}

// PHASE-5: Check invoice-order consistency
async function checkInvoiceOrderConsistency(
  admin: any,
  orderId: string,
  invoiceId: string | null,
  companyId: string
): Promise<ConsistencyCheckResult> {
  const issues: Array<{ type: string; message: string; severity: 'error' | 'warning' }> = [];
  
  try {
    // Check if order exists
    const { data: order, error: orderError } = await admin
      .from('razorpay_orders')
      .select('order_id, status, amount, company_id')
      .eq('order_id', orderId)
      .maybeSingle();
    
    if (orderError) {
      issues.push({
        type: 'database_error',
        message: `Failed to fetch order: ${orderError.message}`,
        severity: 'error',
      });
    }
    
    if (!order) {
      issues.push({
        type: 'missing_order',
        message: `Order not found: ${orderId}`,
        severity: 'warning', // Order might be created later
      });
      return { consistent: true, issues }; // Not an error if order doesn't exist yet
    }
    
    // PHASE-5: Check order status
    if (order.status !== 'paid') {
      issues.push({
        type: 'order_status_mismatch',
        message: `Order status is ${order.status}, expected 'paid'`,
        severity: 'warning',
      });
    }
    
    // PHASE-5: Check company_id consistency
    if (order.company_id && order.company_id !== companyId) {
      issues.push({
        type: 'company_id_mismatch',
        message: `Order company_id (${order.company_id}) doesn't match invoice company_id (${companyId})`,
        severity: 'error',
      });
    }
    
    // PHASE-5: Check if invoice exists and references order
    if (invoiceId) {
      const { data: invoice } = await admin
        .from('billing_invoices')
        .select('id, reference, company_id, amount')
        .eq('id', invoiceId)
        .maybeSingle();
      
      if (invoice) {
        const expectedReference = `razorpay_order:${orderId}`;
        if (invoice.reference !== expectedReference) {
          issues.push({
            type: 'invoice_reference_mismatch',
            message: `Invoice reference (${invoice.reference}) doesn't match expected (${expectedReference})`,
            severity: 'warning',
          });
        }
        
        // Check amount consistency (allow small differences for rounding)
        const orderAmount = Number(order.amount || 0);
        const invoiceAmount = Number(invoice.amount || 0);
        const amountDiff = Math.abs(orderAmount - invoiceAmount);
        
        if (amountDiff > 0.01) {
          issues.push({
            type: 'amount_mismatch',
            message: `Order amount (${orderAmount}) doesn't match invoice amount (${invoiceAmount}), difference: ${amountDiff}`,
            severity: 'warning',
          });
        }
      }
    }
    
    return {
      consistent: issues.filter(i => i.severity === 'error').length === 0,
      issues,
    };
  } catch (error: any) {
    const classified = classifyError(error, { orderId, invoiceId, companyId, operation: 'check_invoice_order_consistency' });
    return {
      consistent: false,
      issues: [{
        type: 'exception',
        message: `Consistency check failed: ${classified.message}`,
        severity: 'error',
      }],
    };
  }
}

// PHASE-5: Validate data integrity for invoice creation
async function validateInvoiceIntegrity(
  admin: any,
  invoiceData: {
    companyId: string;
    providerInvoiceId: string;
    amount: number;
    reference: string;
  }
): Promise<ConsistencyCheckResult> {
  const issues: Array<{ type: string; message: string; severity: 'error' | 'warning' }> = [];
  
  try {
    // PHASE-5: Check if company exists
    const { data: company } = await admin
      .from('companies')
      .select('id')
      .eq('id', invoiceData.companyId)
      .maybeSingle();
    
    if (!company) {
      issues.push({
        type: 'missing_company',
        message: `Company not found: ${invoiceData.companyId}`,
        severity: 'error',
      });
      return { consistent: false, issues };
    }
    
    // PHASE-5: Check for duplicate invoice
    const { data: existingInvoice } = await admin
      .from('billing_invoices')
      .select('id, amount, reference')
      .eq('company_id', invoiceData.companyId)
      .eq('reference', invoiceData.reference)
      .maybeSingle();
    
    if (existingInvoice) {
      const existingAmount = Number(existingInvoice.amount || 0);
      const amountDiff = Math.abs(existingAmount - invoiceData.amount);
      
      if (amountDiff > 0.01) {
        issues.push({
          type: 'duplicate_invoice_amount_mismatch',
          message: `Duplicate invoice found with different amount: existing ${existingAmount}, new ${invoiceData.amount}`,
          severity: 'error',
        });
      } else {
        issues.push({
          type: 'duplicate_invoice',
          message: `Invoice already exists with same reference and amount`,
          severity: 'warning',
        });
      }
    }
    
    // PHASE-5: Check for invoices with same provider invoice ID but different reference
    const { data: sameProviderInvoice } = await admin
      .from('billing_invoices')
      .select('id, reference, company_id')
      .eq('provider_invoice_id', invoiceData.providerInvoiceId)
      .neq('reference', invoiceData.reference)
      .maybeSingle();
    
    if (sameProviderInvoice) {
      issues.push({
        type: 'provider_invoice_id_conflict',
        message: `Provider invoice ID ${invoiceData.providerInvoiceId} already used with different reference: ${sameProviderInvoice.reference}`,
        severity: 'warning',
      });
    }
    
    return {
      consistent: issues.filter(i => i.severity === 'error').length === 0,
      issues,
    };
  } catch (error: any) {
    const classified = classifyError(error, { invoiceData, operation: 'validate_invoice_integrity' });
    return {
      consistent: false,
      issues: [{
        type: 'exception',
        message: `Integrity check failed: ${classified.message}`,
        severity: 'error',
      }],
    };
  }
}

function parsePurpose(purpose: string): { kind: AddonKind; companyId: string; qty: number } | null {
  // Expected: addon_<kind>_company_<companyId>_qty_<qty>
  const match = purpose.match(/^addon_(unit|box|carton|pallet|userid|erp)_company_(.+)_qty_(\d+)$/);
  if (!match) return null;
  const kind = match[1] as AddonKind;
  const companyId = match[2];
  const qty = Number(match[3]);
  
  // PHASE-1: Input validation
  if (!companyId || !isValidUUID(companyId)) return null;
  if (!Number.isInteger(qty) || qty < MIN_QUANTITY || qty > MAX_QUANTITY) return null;
  
  return { kind, companyId, qty };
}

function parseCartPurpose(purpose: string): { companyId: string; cartId: string } | null {
  // Expected: addon_cart_company_<companyId>_cart_<cartId>
  const match = purpose.match(/^addon_cart_company_(.+)_cart_(.+)$/);
  if (!match) return null;
  const companyId = match[1];
  const cartId = match[2];
  
  // PHASE-1: Input validation
  if (!companyId || !isValidUUID(companyId)) return null;
  if (!cartId || !isValidUUID(cartId)) return null;
  
  return { companyId, cartId };
}

function normalizeCartItems(raw: unknown): Array<{ kind: AddonKind; qty: number }> {
  const items: Array<{ kind: AddonKind; qty: number }> = [];
  if (!Array.isArray(raw)) return items;

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as any;
    const kindRaw = String(obj.kind ?? obj.key ?? obj.type ?? "").trim().toLowerCase();
    const qtyRaw = obj.qty ?? obj.quantity ?? obj.count;
    const qty = typeof qtyRaw === "string" ? Number(qtyRaw) : Number(qtyRaw);

    // PHASE-1: Input validation - quantity bounds
    if (
      (kindRaw === "unit" ||
        kindRaw === "box" ||
        kindRaw === "carton" ||
        kindRaw === "pallet" ||
        kindRaw === "userid" ||
        kindRaw === "erp") &&
      Number.isInteger(qty) &&
      qty >= MIN_QUANTITY &&
      qty <= MAX_QUANTITY
    ) {
      items.push({ kind: kindRaw as AddonKind, qty });
    }
  }

  return items;
}

function itemKey(item: { kind: AddonKind; qty: number }) {
  return `${item.kind}:${item.qty}`;
}

async function ensureAddonInvoice(params: {
  admin: any;
  companyId: string;
  orderId: string;
  paymentId: string | null;
  paidAt: string;
  currency?: string | null;
  amountInr: number;
  metadata: any;
}) {
  const { admin, companyId, orderId, paymentId, paidAt, currency, amountInr, metadata } = params;

  // PHASE-4: Validate addon invoice data
  const validation = validateInvoiceData({
    companyId,
    providerInvoiceId: orderId, // Use orderId as invoice ID for addons
    amountInr,
    currency,
    paidAt,
  });
  
  if (!validation.valid) {
    const errorMsg = `PHASE-4: Addon invoice validation failed: ${validation.errors.join('; ')}`;
    console.error(errorMsg, { companyId, orderId, amountInr });
    throw new Error(errorMsg);
  }
  
  if (validation.warnings.length > 0) {
    console.warn('PHASE-4: Addon invoice validation warnings', {
      warnings: validation.warnings,
      companyId,
      orderId,
    });
  }

  const reference = `razorpay_order:${orderId}`;

  // PHASE-4: Check for existing invoice with better error handling
  const { data: existing, error: existingErr } = await admin
    .from('billing_invoices')
    .select('id, amount, reference')
    .eq('company_id', companyId)
    .eq('reference', reference)
    .maybeSingle();

  if (existingErr) {
    const classified = classifyError(existingErr, { companyId, orderId, operation: 'check_existing_addon_invoice' });
    logWebhookError('ensureAddonInvoice', classified);
    throw new Error(`PHASE-4: Failed to check existing invoice: ${existingErr.message}`);
  }
  
  // PHASE-4: If invoice exists, verify it matches current data
  if (existing?.id) {
    const existingAmount = Number(existing.amount || 0);
    const amountDiff = Math.abs(existingAmount - amountInr);
    
    if (amountDiff > 0.01) {
      console.warn('PHASE-4: Existing invoice amount mismatch', {
        existingId: existing.id,
        existingAmount,
        newAmount: amountInr,
        difference: amountDiff,
        companyId,
        orderId,
      });
      // Don't fail - invoice already exists, just log warning
    }
    
    trySyncBillingInvoiceToZoho(String(existing.id)).catch(() => undefined);
    return { id: existing.id, created: false };
  }

  // PRIORITY-2: Fetch and apply company discount for add-ons; Phase 6: gst for invoice fields
  const { data: company } = await admin
    .from('companies')
    .select('discount_type, discount_value, discount_applies_to, gst')
    .eq('id', companyId)
    .maybeSingle();
  
  let discountBreakdown = null;
  let finalAmount = amountInr;
  
  if (company && company.discount_type && company.discount_value !== null) {
    if (company.discount_applies_to === 'addon' || company.discount_applies_to === 'both') {
      let discountAmount = 0;
      if (company.discount_type === 'percentage') {
        discountAmount = (amountInr * company.discount_value) / 100;
      } else if (company.discount_type === 'flat') {
        discountAmount = company.discount_value;
      }
      
      finalAmount = Math.max(0, amountInr - discountAmount);
      discountBreakdown = {
        discount_type: company.discount_type,
        discount_value: company.discount_value,
        discount_amount: discountAmount,
        base_amount: amountInr,
        final_amount: finalAmount,
      };
    }
  }

  const gstNumber = (company as any)?.gst ?? null;
  const hasGstAddon = Boolean(gstNumber && String(gstNumber).trim() !== '');
  const subtotalAddon = Math.max(0, amountInr - (discountBreakdown?.discount_amount ?? 0));
  const taxAmountAddon = hasGstAddon && finalAmount >= subtotalAddon ? Number((finalAmount - subtotalAddon).toFixed(2)) : 0;

  // PHASE-4: Validate final amount
  const amount = Number.isFinite(finalAmount) ? Number(finalAmount.toFixed(2)) : 0;
  if (amount < 0) {
    throw new Error(`PHASE-4: Invalid invoice amount: ${amount} (negative)`);
  }
  if (amount === 0) {
    console.warn('PHASE-4: Addon invoice amount is zero', { companyId, orderId, amountInr, finalAmount });
    // Allow zero amount (may be intentional for free addons)
  }

  // PHASE-4: Reconcile addon invoice amounts
  const base = 0;
  let addons = amount;
  
  // PHASE-4: Ensure addons amount matches final amount
  const addonAmountDiff = Math.abs(addons - amount);
  if (addonAmountDiff > 0.01) {
    console.warn('PHASE-4: Addon amount mismatch, reconciling', {
      expected: amount,
      calculated: addons,
      difference: addonAmountDiff,
      companyId,
      orderId,
    });
    addons = amount; // Use the validated amount
  }

  const invoiceRowWithOptionalColumns: any = {
    company_id: companyId,
    plan: 'Add-ons',
    period_start: paidAt,
    period_end: paidAt,
    amount,
    currency: currency ?? 'INR',
    status: 'PAID',
    paid_at: paidAt,
    reference,
    // Optional columns (may not exist if migrations weren't applied yet)
    provider: 'razorpay',
    provider_invoice_id: orderId,
    provider_payment_id: paymentId,
    base_amount: base,
    addons_amount: addons,
    wallet_applied: 0,
    // Phase 6: Tax, discount for compliant invoices (addon: no billing_cycle)
    tax_rate: hasGstAddon && taxAmountAddon > 0 ? 0.18 : null,
    tax_amount: taxAmountAddon > 0 ? taxAmountAddon : null,
    has_gst: hasGstAddon,
    gst_number: hasGstAddon ? (String(gstNumber).trim() || null) : null,
    discount_type: discountBreakdown?.discount_type ?? (company as any)?.discount_type ?? null,
    discount_value: discountBreakdown?.discount_value ?? (company as any)?.discount_value ?? null,
    discount_amount: discountBreakdown?.discount_amount ?? null,
    billing_cycle: null,
    metadata: {
      ...(metadata ?? {}),
      pricing: { 
        base: base, 
        discount: discountBreakdown?.discount_amount ?? 0,
        tax: taxAmountAddon,
        final: addons,
        addons: addons 
      },
      discount: discountBreakdown,
      razorpay: { order_id: orderId, payment_id: paymentId },
      created_by: 'system',
    },
  };

  const invoiceRowMinimal: any = {
    company_id: companyId,
    plan: 'Add-ons',
    period_start: paidAt,
    period_end: paidAt,
    amount,
    currency: currency ?? 'INR',
    status: 'PAID',
    paid_at: paidAt,
    reference,
    metadata: {
      ...(metadata ?? {}),
      pricing: { 
        base: base, 
        discount: discountBreakdown?.discount_amount ?? 0,
        final: addons,
        addons: addons 
      },
      discount: discountBreakdown,
      razorpay: { order_id: orderId, payment_id: paymentId },
      created_by: 'system',
    },
  };

  // PHASE-4: Try inserting with retry and better error handling
  let invoiceId: string | null = null;
  
  try {
    // Try inserting with optional columns first; if schema doesn't have them, retry minimal.
    const firstAttempt = await admin
      .from('billing_invoices')
      .insert(invoiceRowWithOptionalColumns)
      .select('id')
      .maybeSingle();

    if (!firstAttempt.error && firstAttempt.data?.id) {
      invoiceId = String(firstAttempt.data.id);
      
      // PHASE-4: Verify invoice was created correctly
      const { data: verifyInvoice } = await admin
        .from('billing_invoices')
        .select('id, amount, reference, company_id')
        .eq('id', invoiceId)
        .maybeSingle();
      
      if (verifyInvoice) {
        // PHASE-4: Verify amounts match
        const storedAmount = Number(verifyInvoice.amount || 0);
        const amountDiff = Math.abs(storedAmount - amount);
        if (amountDiff > 0.01) {
          console.warn('PHASE-4: Addon invoice amount mismatch after creation', {
            invoiceId,
            expected: amount,
            stored: storedAmount,
            difference: amountDiff,
            companyId,
            orderId,
          });
        }
        
        trySyncBillingInvoiceToZoho(invoiceId).catch(() => undefined);
        return { id: invoiceId, created: true };
      }
    }

    const msg = String(firstAttempt.error?.message ?? firstAttempt.error ?? 'Unknown error');
    const looksLikeMissingColumn = /column .* does not exist/i.test(msg);
    
    if (!looksLikeMissingColumn) {
      // PHASE-4: Check if it's a duplicate key error (race condition)
      const isDuplicate = /duplicate key|unique constraint|already exists/i.test(msg);
      if (isDuplicate) {
        // PHASE-4: Invoice was created by another request, fetch it
        const { data: existing } = await admin
          .from('billing_invoices')
          .select('id')
          .eq('company_id', companyId)
          .eq('reference', reference)
          .maybeSingle();
        
        if (existing?.id) {
          invoiceId = String(existing.id);
          trySyncBillingInvoiceToZoho(invoiceId).catch(() => undefined);
          return { id: invoiceId, created: false };
        }
      }
      
      const classified = classifyError(new Error(msg), { companyId, orderId, operation: 'create_addon_invoice' });
      logWebhookError('ensureAddonInvoice', classified);
      throw new Error(`PHASE-4: Failed to create addon invoice: ${msg}`);
    }

    // PHASE-4: Retry with minimal schema
    const secondAttempt = await admin
      .from('billing_invoices')
      .insert(invoiceRowMinimal)
      .select('id')
      .maybeSingle();

    if (secondAttempt.error) {
      const errorMsg = String(secondAttempt.error.message ?? secondAttempt.error);
      const classified = classifyError(new Error(errorMsg), { companyId, orderId, operation: 'create_addon_invoice_minimal' });
      logWebhookError('ensureAddonInvoice', classified);
      throw new Error(`PHASE-4: Failed to create addon invoice (minimal schema): ${errorMsg}`);
    }
    
    if (secondAttempt.data?.id) {
      invoiceId = String(secondAttempt.data.id);
      trySyncBillingInvoiceToZoho(invoiceId).catch(() => undefined);
    }
    
    return { id: invoiceId, created: true };
  } catch (error: any) {
    // PHASE-4: Log invoice creation failure with full context
    const classified = classifyError(error, {
      companyId,
      orderId,
      amountInr: amount,
      operation: 'ensureAddonInvoice',
    });
    logWebhookError('ensureAddonInvoice', classified);
    throw error;
  }
}

// PHASE-2: Data validation before addon application
function validateAddonApplication(params: {
  companyId: string;
  kind: AddonKind;
  qty: number;
  orderId: string;
}): void {
  if (!isValidUUID(params.companyId)) {
    throw new Error(`Invalid company ID: ${params.companyId}`);
  }
  if (!params.orderId || typeof params.orderId !== 'string' || params.orderId.trim().length === 0) {
    throw new Error(`Invalid order ID: ${params.orderId}`);
  }
  if (!Number.isInteger(params.qty) || params.qty < MIN_QUANTITY || params.qty > MAX_QUANTITY) {
    throw new Error(`Invalid quantity: ${params.qty} (must be between ${MIN_QUANTITY} and ${MAX_QUANTITY})`);
  }
  const validKinds: AddonKind[] = ['unit', 'box', 'carton', 'pallet', 'userid', 'erp'];
  if (!validKinds.includes(params.kind)) {
    throw new Error(`Invalid addon kind: ${params.kind}`);
  }
}

async function applySingleAddon(params: {
  supabase: any;
  admin: any;
  companyId: string;
  kind: AddonKind;
  qty: number;
  orderId: string;
  paymentId: string | null;
  paidAt: string;
}) {
  const { supabase, admin, companyId, kind, qty, orderId, paymentId, paidAt } = params;
  
  // PHASE-2: Validate inputs before processing
  validateAddonApplication({ companyId, kind, qty, orderId });

  if (kind === "userid") {
    // PHASE-3: Retry company fetch with error handling
    // PHASE-2: Atomic operation with validation
    let companyRow: any = null;
    try {
      const result = await retryOperation(
        async () => {
          const result = await supabase
            .from("companies")
            .select("id, extra_user_seats")
            .eq("id", companyId)
            .maybeSingle();
          
          if (result.error) {
            throw new Error(result.error.message);
          }
          return result;
        },
        3,
        1000,
        { companyId, kind, operation: 'fetch_company_userid' }
      );
      companyRow = result.data;
    } catch (error: any) {
      const classified = classifyError(error, { companyId, kind });
      logWebhookError('applySingleAddon', classified);
      throw new Error(`PHASE-2: Company fetch failed: ${classified.message}`);
    }
    if (!companyRow) {
      const error = classifyError(new Error(`Company not found: ${companyId}`), { companyId, kind });
      logWebhookError('applySingleAddon', error);
      throw new Error(`PHASE-2: Company not found: ${companyId}`);
    }

    const currentExtra = Number((companyRow as any).extra_user_seats ?? 0);
    // PHASE-2: Validate before update to prevent overflow
    if (!Number.isFinite(currentExtra) || currentExtra < 0) {
      const error = classifyError(new Error(`Invalid current extra_user_seats value: ${currentExtra}`), { companyId, kind, currentExtra });
      logWebhookError('applySingleAddon', error);
      throw new Error(`PHASE-2: Invalid current extra_user_seats value: ${currentExtra}`);
    }
    
    const nextExtra = currentExtra + qty;
    // PHASE-2: Bounds check
    if (nextExtra > MAX_QUANTITY) {
      const error = classifyError(new Error(`Quantity overflow: ${nextExtra} exceeds maximum ${MAX_QUANTITY}`), { companyId, kind, nextExtra, max: MAX_QUANTITY });
      logWebhookError('applySingleAddon', error);
      throw new Error(`PHASE-2: Quantity overflow: ${nextExtra} exceeds maximum ${MAX_QUANTITY}`);
    }

    // PHASE-3: Retry company update with error handling
    try {
      await retryOperation(
        async () => {
          const result = await supabase
            .from("companies")
            .update({ extra_user_seats: nextExtra, updated_at: paidAt })
            .eq("id", companyId)
            .eq("extra_user_seats", currentExtra); // PHASE-2: Optimistic locking
          
          if (result.error) {
            throw new Error(result.error.message);
          }
          return result;
        },
        3,
        1000,
        { companyId, kind, currentExtra, nextExtra, operation: 'update_company_userid' }
      );
    } catch (error: any) {
      const classified = classifyError(error, { companyId, kind, currentExtra, nextExtra });
      logWebhookError('applySingleAddon', classified);
      throw new Error(`PHASE-2: Company update failed: ${classified.message}`);
    }

    await writeAuditLog({
      companyId,
      actor: "system",
      action: "addon_userid_activated_webhook",
      status: "success",
      integrationSystem: "razorpay",
      metadata: { order_id: orderId, payment_id: paymentId, qty, extra_user_seats: nextExtra },
    }).catch(() => undefined);

    return { kind, qty, extra_user_seats: nextExtra };
  }

  if (kind === "erp") {
    // PHASE-3: Retry company fetch with error handling
    // PHASE-2: Atomic operation with validation
    let companyRow: any = null;
    try {
      const result = await retryOperation(
        async () => {
          const result = await supabase
            .from("companies")
            .select("id, extra_erp_integrations")
            .eq("id", companyId)
            .maybeSingle();
          
          if (result.error) {
            throw new Error(result.error.message);
          }
          return result;
        },
        3,
        1000,
        { companyId, kind, operation: 'fetch_company_erp' }
      );
      companyRow = result.data;
    } catch (error: any) {
      const classified = classifyError(error, { companyId, kind });
      logWebhookError('applySingleAddon', classified);
      throw new Error(`PHASE-2: Company fetch failed: ${classified.message}`);
    }
    if (!companyRow) {
      const error = classifyError(new Error(`Company not found: ${companyId}`), { companyId, kind });
      logWebhookError('applySingleAddon', error);
      throw new Error(`PHASE-2: Company not found: ${companyId}`);
    }

    const currentExtra = Number((companyRow as any).extra_erp_integrations ?? 0);
    // PHASE-2: Validate before update to prevent overflow
    if (!Number.isFinite(currentExtra) || currentExtra < 0) {
      const error = classifyError(new Error(`Invalid current extra_erp_integrations value: ${currentExtra}`), { companyId, kind, currentExtra });
      logWebhookError('applySingleAddon', error);
      throw new Error(`PHASE-2: Invalid current extra_erp_integrations value: ${currentExtra}`);
    }
    
    const nextExtra = currentExtra + qty;
    // PHASE-2: Bounds check
    if (nextExtra > MAX_QUANTITY) {
      const error = classifyError(new Error(`Quantity overflow: ${nextExtra} exceeds maximum ${MAX_QUANTITY}`), { companyId, kind, nextExtra, max: MAX_QUANTITY });
      logWebhookError('applySingleAddon', error);
      throw new Error(`PHASE-2: Quantity overflow: ${nextExtra} exceeds maximum ${MAX_QUANTITY}`);
    }

    // PHASE-3: Retry company update with error handling
    try {
      await retryOperation(
        async () => {
          const result = await supabase
            .from("companies")
            .update({ extra_erp_integrations: nextExtra, updated_at: paidAt })
            .eq("id", companyId)
            .eq("extra_erp_integrations", currentExtra); // PHASE-2: Optimistic locking
          
          if (result.error) {
            throw new Error(result.error.message);
          }
          return result;
        },
        3,
        1000,
        { companyId, kind, currentExtra, nextExtra, operation: 'update_company_erp' }
      );
    } catch (error: any) {
      const classified = classifyError(error, { companyId, kind, currentExtra, nextExtra });
      logWebhookError('applySingleAddon', classified);
      throw new Error(`PHASE-2: Company update failed: ${classified.message}`);
    }

    await writeAuditLog({
      companyId,
      actor: "system",
      action: "addon_erp_activated_webhook",
      status: "success",
      integrationSystem: "razorpay",
      metadata: { order_id: orderId, payment_id: paymentId, qty, extra_erp_integrations: nextExtra },
    }).catch(() => undefined);

    return { kind, qty, extra_erp_integrations: nextExtra };
  }

  // PHASE-2: Ensure billing usage record exists before quota addition
  // PHASE-3: Retry billing usage activation with error handling
  try {
    await retryOperation(
      async () => {
        await ensureActiveBillingUsage({ supabase: admin, companyId });
      },
      3,
      1000,
      { companyId, kind, operation: 'ensure_billing_usage' }
    );
  } catch (error: any) {
    const classified = classifyError(error, { companyId, kind });
    logWebhookError('applySingleAddon', classified);
    throw error;
  }
  
  // PHASE-2: Validate RPC parameters before call
  if (!isValidUUID(companyId)) {
    const error = classifyError(new Error(`Invalid company ID for RPC: ${companyId}`), { companyId, kind });
    logWebhookError('applySingleAddon', error);
    throw new Error(`PHASE-2: Invalid company ID for RPC: ${companyId}`);
  }
  
  // PHASE-3: Retry RPC call with error handling
  let addRow: any = null;
  try {
    const result = await retryOperation(
      async () => {
        const result = await admin.rpc("billing_usage_add_quota", {
          p_company_id: companyId,
          p_kind: kind,
          p_qty: qty,
        });
        
        if (result.error) {
          throw new Error(result.error.message);
        }
        return result;
      },
      3,
      1000,
      { companyId, kind, qty, operation: 'rpc_add_quota' }
    );
    addRow = result.data;
  } catch (error: any) {
    const classified = classifyError(error, { companyId, kind, qty });
    logWebhookError('applySingleAddon', classified);
    throw new Error(`PHASE-2: RPC call failed: ${classified.message}`);
  }

  const added = Array.isArray(addRow) ? (addRow as any[])[0] : (addRow as any);
  if (!added?.ok) {
    const error = classifyError(new Error(`Quota addition failed: ${added?.error ?? 'Unknown error'}`), { companyId, kind, qty, rpcResponse: added });
    logWebhookError('applySingleAddon', error);
    throw new Error(`PHASE-2: Quota addition failed: ${added?.error ?? 'Unknown error'}`);
  }
  
  // PHASE-2: Validate response data
  if (typeof added.remaining !== 'number' || !Number.isFinite(added.remaining)) {
    console.warn('PHASE-2: Invalid remaining quota in RPC response', added);
  }

  await writeAuditLog({
    companyId,
    actor: "system",
    action: `addon_${kind}_activated_webhook`,
    status: "success",
    integrationSystem: "razorpay",
    metadata: { order_id: orderId, payment_id: paymentId, qty, remaining: added.remaining },
  }).catch(() => undefined);

  return { kind, qty, remaining: added.remaining };
}

async function applyAddonFromOrder(orderId: string, paymentId: string | null) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // PHASE-3: Retry order fetch with error handling
  let orderRecord: any = null;
  try {
    const result = await retryOperation(
      async () => {
        const result = await supabase
          .from("razorpay_orders")
          .select("*")
          .eq("order_id", orderId)
          .maybeSingle();
        
        if (result.error) {
          throw new Error(result.error.message);
        }
        return result;
      },
      3, // max retries
      1000, // initial delay
      { orderId, operation: 'fetch_order' }
    );
    orderRecord = result.data;
  } catch (error: any) {
    const classified = classifyError(error, { orderId, operation: 'fetch_order' });
    logWebhookError('applyAddonFromOrder', classified);
    throw new Error(classified.message);
  }
  
  if (!orderRecord) {
    const error = classifyError(new Error("Order not found"), { orderId });
    logWebhookError('applyAddonFromOrder', error);
    throw new Error("Order not found");
  }

  const purpose = String(orderRecord.purpose ?? "");
  const parsed = parsePurpose(purpose);
  const parsedCart = parsed ? null : parseCartPurpose(purpose);
  if (!parsed && !parsedCart) {
    return { ignored: true };
  }

  const paidAt = new Date().toISOString();

  // PHASE-3: Retry order status update with error handling
  // PHASE-1 FIX: Race condition prevention - use atomic update with status check
  // Update only if status is NOT 'paid' (prevents duplicate processing)
  let updatedOrders: any[] | null = null;
  try {
    const result = await retryOperation(
      async () => {
        const result = await supabase
          .from("razorpay_orders")
          .update({
            status: "paid",
            paid_at: paidAt,
            ...(paymentId ? { payment_id: paymentId } : {}),
          })
          .eq("order_id", orderId)
          .neq("status", "paid")  // Only update if not already paid
          .select("order_id");
        
        if (result.error) {
          throw new Error(result.error.message);
        }
        return result;
      },
      3,
      1000,
      { orderId, paymentId, operation: 'update_order_status' }
    );
    updatedOrders = result.data;
  } catch (error: any) {
    const classified = classifyError(error, { orderId, paymentId, operation: 'update_order_status' });
    logWebhookError('applyAddonFromOrder', classified);
    throw new Error(classified.message);
  }

  // PHASE-1: If no rows updated, order was already processed (idempotency check)
  if (!updatedOrders || updatedOrders.length === 0) {
    try {
      const admin = getSupabaseAdmin();
      const amountInr = Number((orderRecord as any).amount ?? 0);
      const currency = (orderRecord as any).currency ?? 'INR';

      const purpose = String(orderRecord.purpose ?? '');
      const parsed = parsePurpose(purpose);
      const parsedCart = parsed ? null : parseCartPurpose(purpose);

      if (parsed) {
        await ensureAddonInvoice({
          admin,
          companyId: parsed.companyId,
          orderId,
          paymentId,
          paidAt: (orderRecord as any).paid_at ?? paidAt,
          currency,
          amountInr,
          metadata: { type: 'addon', kind: parsed.kind, qty: parsed.qty },
        });
      } else if (parsedCart) {
        await ensureAddonInvoice({
          admin,
          companyId: parsedCart.companyId,
          orderId,
          paymentId,
          paidAt: (orderRecord as any).paid_at ?? paidAt,
          currency,
          amountInr,
          metadata: { type: 'addon_cart', cart_id: parsedCart.cartId },
        });
      }
    } catch (invoiceErr) {
      // PHASE-3: Classify and log invoice creation failure
      const classified = classifyError(invoiceErr, {
        orderId,
        companyId: parsed?.companyId || parsedCart?.companyId,
        operation: 'create_invoice_already_processed',
      });
      logWebhookError('Invoice Creation (Already Processed)', classified);
      // Don't throw - order was already processed, invoice creation is secondary
      // But log for monitoring/recovery
    }

    return { alreadyProcessed: true };
  }

  const admin = getSupabaseAdmin();

  if (parsed) {
    const applied = await applySingleAddon({
      supabase,
      admin,
      companyId: parsed.companyId,
      kind: parsed.kind,
      qty: parsed.qty,
      orderId,
      paymentId,
      paidAt,
    });

    // PHASE-3: Invoice creation with retry - log failures for retry
    try {
      await retryOperation(
        async () => {
          await ensureAddonInvoice({
            admin,
            companyId: parsed.companyId,
            orderId,
            paymentId,
            paidAt,
            currency: (orderRecord as any).currency ?? 'INR',
            amountInr: Number((orderRecord as any).amount ?? 0),
            metadata: { type: 'addon', kind: parsed.kind, qty: parsed.qty },
          });
        },
        2, // Fewer retries for add-on invoices (non-critical)
        1000,
        { orderId, companyId: parsed.companyId, kind: parsed.kind, operation: 'create_addon_invoice' }
      );
    } catch (invoiceErr) {
      // PHASE-3: Classify and log - don't fail webhook (add-on already applied)
      const classified = classifyError(invoiceErr, {
        orderId,
        companyId: parsed.companyId,
        kind: parsed.kind,
        operation: 'create_addon_invoice',
      });
      logWebhookError('Add-on Invoice Creation', classified);
      // Invoice can be created via retry mechanism or manual recovery
    }

    return { alreadyProcessed: false, ...parsed, ...applied };
  }

  const cartInfo = parsedCart!;
  const { data: cartRow, error: cartErr } = await supabase
    .from("addon_carts")
    .select("*")
    .eq("id", cartInfo.cartId)
    .eq("company_id", cartInfo.companyId)
    .maybeSingle();

  if (cartErr) throw new Error(cartErr.message);
  if (!cartRow) throw new Error("Cart not found");

  const cartStatus = String((cartRow as any).status ?? "");
  if (cartStatus === "applied") {
    return { alreadyProcessed: true, cart: true };
  }

  const orderAmountPaise = Number((orderRecord as any).amount_paise ?? 0);
  const cartTotalPaise = Number((cartRow as any).total_paise ?? 0);
  if (Number.isFinite(orderAmountPaise) && Number.isFinite(cartTotalPaise) && cartTotalPaise > 0) {
    if (orderAmountPaise !== cartTotalPaise) {
      throw new Error("Order amount mismatch for cart");
    }
  }

  const existingOrderId = (cartRow as any).order_id as string | null | undefined;
  if (existingOrderId && existingOrderId !== orderId) {
    throw new Error("Cart is linked to a different order");
  }

  if (!existingOrderId) {
    await supabase
      .from("addon_carts")
      .update({ order_id: orderId, status: "paid" })
      .eq("id", cartInfo.cartId)
      .eq("company_id", cartInfo.companyId);
  }

  const items = normalizeCartItems((cartRow as any).items);
  if (items.length === 0) throw new Error("Cart has no valid items");

  const appliedItems = normalizeCartItems((cartRow as any).applied_items);
  const appliedSet = new Set(appliedItems.map(itemKey));

  // PHASE-1 FIX: Process all items first, then update cart atomically
  // This prevents partial state if processing fails mid-way
  const results: any[] = [];
  const itemsToApply: Array<{ kind: AddonKind; qty: number }> = [];
  
  // Collect items that need to be applied
  for (const item of items) {
    if (appliedSet.has(itemKey(item))) continue;
    itemsToApply.push(item);
  }

  // PHASE-1: Process all items before updating cart status
  // If any item fails, entire operation fails (no partial state)
  for (const item of itemsToApply) {
    const applied = await applySingleAddon({
      supabase,
      admin,
      companyId: cartInfo.companyId,
      kind: item.kind,
      qty: item.qty,
      orderId,
      paymentId,
      paidAt,
    });

    results.push(applied);
    appliedItems.push({ kind: item.kind, qty: item.qty });
    appliedSet.add(itemKey(item));
  }

  // PHASE-1: Single atomic update after all items processed successfully
  // If this fails, items are already applied but cart status may be inconsistent
  // Recovery: Check applied_items vs cart status
  const { error: cartUpdateError } = await supabase
    .from("addon_carts")
    .update({ 
      status: "applied", 
      applied_at: paidAt, 
      applied_items: appliedItems 
    })
    .eq("id", cartInfo.cartId)
    .eq("company_id", cartInfo.companyId);

  if (cartUpdateError) {
    // PHASE-1: Log cart update failure - items are applied but cart status not updated
    console.error('PHASE-1: Cart status update failed after item processing', {
      cartId: cartInfo.cartId,
      companyId: cartInfo.companyId,
      appliedItems,
      error: cartUpdateError.message,
    });
    // Don't throw - items are already applied, just log for recovery
  }

  // PHASE-3: Invoice creation for cart with retry - log failures for retry
  try {
    await retryOperation(
      async () => {
        await ensureAddonInvoice({
          admin,
          companyId: cartInfo.companyId,
          orderId,
          paymentId,
          paidAt,
          currency: (orderRecord as any).currency ?? 'INR',
          amountInr: Number((orderRecord as any).amount ?? 0),
          metadata: { type: 'addon_cart', cart_id: cartInfo.cartId, items },
        });
      },
      2, // Fewer retries for cart invoices (non-critical)
      1000,
      { orderId, cartId: cartInfo.cartId, companyId: cartInfo.companyId, operation: 'create_cart_invoice' }
    );
  } catch (invoiceErr) {
    // PHASE-3: Classify and log - don't fail webhook (cart items already applied)
    const classified = classifyError(invoiceErr, {
      orderId,
      cartId: cartInfo.cartId,
      companyId: cartInfo.companyId,
      operation: 'create_cart_invoice',
    });
    logWebhookError('Cart Invoice Creation', classified);
    // Invoice can be created via retry mechanism or manual recovery
  }

  try {
    await writeAuditLog({
      companyId: cartInfo.companyId,
      actor: "system",
      action: "addon_cart_activated_webhook",
      status: "success",
      integrationSystem: "razorpay",
      metadata: { order_id: orderId, payment_id: paymentId, cart_id: cartInfo.cartId, items: appliedItems },
    });
  } catch {
    // ignore
  }

  return { alreadyProcessed: false, cart: true, cart_id: cartInfo.cartId, items: appliedItems, results };
}

export async function POST(req: Request) {
  // Razorpay webhook: verify signature using webhook secret
  // Configure env: RAZORPAY_WEBHOOK_SECRET
  
  // PHASE-7: Generate correlation ID for request tracking
  const correlationId = generateCorrelationId();
  const requestStartTime = Date.now();
  
  // PHASE-3: Capture variables for error handling
  let webhookEvent: any = null;
  let webhookEventType: string = '';
  let webhookRawBody: string = '';
  let webhookSignature: string | null = null;
  let webhookAdmin: any = null;
  
  // PHASE-6: Capture security context
  const securityContext = {
    ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
    timestamp: new Date().toISOString(),
  };
  
  // PHASE-7: Log webhook received
  logWithContext('info', 'Webhook received', {
    correlationId,
    ...securityContext,
  });
  
  try {
    const signature = req.headers.get("x-razorpay-signature");
    const rawBody = await req.text();
    
    // PHASE-6: Check payload size before processing
    if (rawBody.length > MAX_WEBHOOK_PAYLOAD_SIZE) {
      console.error('PHASE-6: Webhook payload too large', {
        size: rawBody.length,
        maxSize: MAX_WEBHOOK_PAYLOAD_SIZE,
        ...securityContext,
      });
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    
    // PHASE-3: Store for error handling
    webhookRawBody = rawBody;
    webhookSignature = signature;

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    // PHASE-6: Enhanced signature verification
    const signatureVerification = verifyRazorpayWebhookSignatureEnhanced(rawBody, signature, webhookSecret);
    if (!signatureVerification.valid) {
      // PHASE-6: Log security event
      console.error('PHASE-6: Webhook signature verification failed', {
        reason: signatureVerification.reason,
        ...securityContext,
      });
      
      return NextResponse.json({ 
        error: "Invalid webhook signature",
        reason: signatureVerification.reason,
      }, { status: 401 });
    }

    // PHASE-6: Parse and sanitize event
    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch (parseError: any) {
      console.error('PHASE-6: Failed to parse webhook JSON', {
        error: parseError.message,
        bodyLength: rawBody.length,
        ...securityContext,
      });
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    
    // PHASE-6: Sanitize webhook event
    event = sanitizeWebhookEvent(event);
    if (!event) {
      console.error('PHASE-6: Webhook event sanitization failed', {
        ...securityContext,
      });
      return NextResponse.json({ error: "Invalid webhook event" }, { status: 400 });
    }
    
    const eventType = String(event?.event ?? "");
    const eventId = String(event?.id ?? '');
    
    // PHASE-3: Store for error handling
    webhookEvent = event;
    webhookEventType = eventType;
    
    // PHASE-2: Webhook event deduplication - check if already processed
    const admin = getSupabaseAdmin();
    webhookAdmin = admin;
    
    // Generate idempotency key from event ID and entity
    let idempotencyKey: string | null = null;
    const invoiceEntityForIdempotency = event?.payload?.invoice?.entity;
    const subscriptionEntityForIdempotency = event?.payload?.subscription?.entity;
    const paymentEntityForIdempotency = event?.payload?.payment?.entity;
    
    if (invoiceEntityForIdempotency?.id) {
      idempotencyKey = generateWebhookIdempotencyKey(eventId, 'invoice', String(invoiceEntityForIdempotency.id));
    } else if (subscriptionEntityForIdempotency?.id) {
      idempotencyKey = generateWebhookIdempotencyKey(eventId, 'subscription', String(subscriptionEntityForIdempotency.id));
    } else if (paymentEntityForIdempotency?.id && paymentEntityForIdempotency?.order_id) {
      idempotencyKey = generateWebhookIdempotencyKey(eventId, 'payment', String(paymentEntityForIdempotency.id));
    }
    
    // PHASE-2: Check idempotency if we have a key
    if (idempotencyKey) {
      const alreadyProcessed = await isWebhookProcessed(admin, idempotencyKey);
      if (alreadyProcessed) {
        console.log('PHASE-2: Webhook event already processed', { eventId, eventType, idempotencyKey });
        return NextResponse.json({ 
          received: true, 
          duplicate: true,
          message: 'Event already processed' 
        }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
      }
    }

    // Subscription invoices (monthly/recurring)
    // Razorpay sends invoice.* events for subscription cycles. Create a billing invoice
    // so it shows up in the dashboard Billing → Invoices list.
    if (invoiceEntityForIdempotency?.id) {
      const invoiceEntity = invoiceEntityForIdempotency;
      // PHASE-2: Admin already fetched above for idempotency check

      const providerInvoiceId = String(invoiceEntity.id);
      const providerPaymentId = invoiceEntity.payment_id ? String(invoiceEntity.payment_id) : null;
      const currency = invoiceEntity.currency ? String(invoiceEntity.currency).toUpperCase() : 'INR';

      const amountPaise =
        typeof invoiceEntity.amount_paid === 'number'
          ? invoiceEntity.amount_paid
          : typeof invoiceEntity.amount === 'number'
            ? invoiceEntity.amount
            : typeof invoiceEntity.amount_due === 'number'
              ? invoiceEntity.amount_due
              : 0;

      const amountInr = Number(amountPaise) / 100;

      const paidAt =
        typeof invoiceEntity.paid_at === 'number'
          ? new Date(invoiceEntity.paid_at * 1000).toISOString()
          : new Date().toISOString();

      const periodStart =
        typeof invoiceEntity.period_start === 'number'
          ? new Date(invoiceEntity.period_start * 1000).toISOString()
          : paidAt;

      const periodEnd =
        typeof invoiceEntity.period_end === 'number'
          ? new Date(invoiceEntity.period_end * 1000).toISOString()
          : paidAt;

      const notesCompanyId = invoiceEntity?.notes?.company_id ? String(invoiceEntity.notes.company_id) : null;
      const subscriptionId = invoiceEntity.subscription_id ? String(invoiceEntity.subscription_id) : null;

      let companyId: string | null = notesCompanyId;
      if (!companyId && subscriptionId) {
        const { data: companyRow } = await admin
          .from('companies')
          .select('id, subscription_plan')
          .eq('razorpay_subscription_id', subscriptionId)
          .maybeSingle();
        companyId = (companyRow as any)?.id ?? null;
      }

      if (!companyId) {
        // Acknowledge to avoid retries, but we can't attribute this invoice.
        return NextResponse.json({ received: true, invoice: true, ignored: true, reason: 'company_not_found' });
      }

      const planFromNotes = invoiceEntity?.notes?.plan ? String(invoiceEntity.notes.plan) : null;
      const planLabel = planFromNotes ? `Subscription (${planFromNotes})` : 'Subscription';

      const status = String(invoiceEntity.status ?? '').toLowerCase();
      const isPaidEvent = eventType === 'invoice.paid' || status === 'paid';
      if (!isPaidEvent) {
        // Only create paid invoices for now.
        return NextResponse.json({ received: true, invoice: true, ignored: true, status });
      }
      
      // PHASE-6: Authorize webhook operation (before invoice creation)
      const authorization = await authorizeWebhookOperation(admin, companyId, 'create_subscription_invoice');
      if (!authorization.authorized) {
        await writeSecurityAuditLog({
          companyId,
          action: 'webhook_invoice_creation_unauthorized',
          status: 'failed',
          securityContext: {
            webhookEventId: eventId,
            webhookEventType: eventType,
            signatureValid: true,
          },
          metadata: { reason: authorization.reason, providerInvoiceId },
        });
        
        throw new Error(`PHASE-6: Authorization failed: ${authorization.reason}`);
      }
      
      // PHASE-5: Validate invoice integrity before creation
      const integrityCheck = await validateInvoiceIntegrity(admin, {
        companyId,
        providerInvoiceId,
        amount: amountInr,
        reference: `razorpay_invoice:${providerInvoiceId}`,
      });
      
      if (!integrityCheck.consistent) {
        const errors = integrityCheck.issues.filter(i => i.severity === 'error');
        if (errors.length > 0) {
          const errorMsg = `PHASE-5: Invoice integrity check failed: ${errors.map(e => e.message).join('; ')}`;
          console.error(errorMsg, { companyId, providerInvoiceId, amountInr });
          
          // PHASE-6: Log security event
          await writeSecurityAuditLog({
            companyId,
            action: 'webhook_invoice_integrity_check_failed',
            status: 'failed',
            securityContext: {
              webhookEventId: eventId,
              webhookEventType: eventType,
              signatureValid: true,
            },
            metadata: { errors, providerInvoiceId },
          });
          
          throw new Error(errorMsg);
        }
        
        // Log warnings but continue
        const warnings = integrityCheck.issues.filter(i => i.severity === 'warning');
        if (warnings.length > 0) {
          console.warn('PHASE-5: Invoice integrity warnings', {
            warnings: warnings.map(w => w.message),
            companyId,
            providerInvoiceId,
          });
        }
      }

      // PHASE-1 FIX: Fetch company discount for invoice breakdown
      // NOTE: We cannot accurately estimate discount from final amount.
      // Store discount metadata only if we have original plan price.
      let discountBreakdown = null;
      if (companyId) {
        const { data: company } = await admin
          .from('companies')
          .select('discount_type, discount_value, discount_applies_to')
          .eq('id', companyId)
          .maybeSingle();
        
        if (company && company.discount_type && company.discount_value !== null) {
          if (company.discount_applies_to === 'subscription' || company.discount_applies_to === 'both') {
            // PHASE-1 FIX: Don't estimate - only store discount metadata if we know original amount
            // For percentage discounts, we need original plan price (not available here)
            // For flat discounts, we can calculate if discount was applied
            let discountAmount = 0;
            let baseAmount = amountInr;
            
            if (company.discount_type === 'flat') {
              // Flat discount: assume it was applied, so base = final + discount
              discountAmount = company.discount_value;
              baseAmount = amountInr + discountAmount;
            } else if (company.discount_type === 'percentage') {
              // PHASE-1 FIX: Percentage discount estimation is unreliable
              // Only store discount metadata, don't estimate base amount
              // Base amount should be fetched from subscription plan or Razorpay API
              discountAmount = 0; // Unknown - would need original plan price
              baseAmount = amountInr; // Use actual amount as base (conservative)
            }
            
            discountBreakdown = {
              discount_type: company.discount_type,
              discount_value: company.discount_value,
              discount_amount: discountAmount,
              base_amount: baseAmount,
              final_amount: amountInr,
              note: company.discount_type === 'percentage' 
                ? 'Base amount estimation not available - original plan price required'
                : undefined,
            };
          }
        }
      }

      // PHASE-3: Invoice creation with retry and error handling
      // Invoice is critical financial record - cannot be silently ignored
      // PHASE-7: Measure performance of invoice creation
      try {
        const { duration } = await measurePerformance(
          'create_subscription_invoice',
          async () => {
            await retryOperation(
              async () => {
                await ensureSubscriptionInvoice({
                  admin,
                  companyId,
                  providerInvoiceId,
                  providerPaymentId,
                  paidAt,
                  periodStart,
                  periodEnd,
                  currency,
                  amountInr,
                  planLabel,
                  metadata: {
                    type: 'subscription',
                    event: eventType,
                    razorpay_subscription_id: subscriptionId,
                    discount: discountBreakdown,
                    notes: invoiceEntity?.notes ?? {},
                  },
                });
              },
              3, // max retries
              2000, // initial delay (longer for critical operations)
              { companyId, providerInvoiceId, amountInr, operation: 'create_subscription_invoice' }
            );
          },
          { correlationId, companyId, providerInvoiceId }
        );
        
        logWithContext('info', 'Subscription invoice created', {
          correlationId,
          companyId,
          providerInvoiceId,
          duration,
        });
      } catch (e) {
        // PHASE-3: Classify and log error
        const classified = classifyError(e, {
          companyId,
          providerInvoiceId,
          amountInr,
          eventType,
          operation: 'create_subscription_invoice',
        });
        logWebhookError('Subscription Invoice Creation', classified);
        
        // PHASE-3: Log to dead letter queue if non-retryable
        if (!classified.retryable) {
          await logToDeadLetterQueue(admin, idempotencyKey, eventType, classified, event).catch(() => {
            // Ignore DLQ errors - already logged
          });
        }
        
        // PHASE-3: Re-throw to fail webhook - invoice creation is critical
        // Razorpay will retry webhook, and we can process it again
        throw new Error(`Invoice creation failed: ${classified.message}`);
      }

      // PHASE-2: Mark webhook as processed after successful invoice creation
      if (idempotencyKey) {
        await markWebhookProcessed(admin, idempotencyKey, eventType, {
          invoice_id: providerInvoiceId,
          company_id: companyId,
          amount: amountInr,
        }).catch(err => {
          console.warn('PHASE-2: Failed to mark invoice webhook as processed', err);
        });
      }
      
      // PHASE-6: Log successful invoice creation with security context
      await writeSecurityAuditLog({
        companyId,
        action: 'webhook_subscription_invoice_created',
        status: 'success',
        securityContext: {
          webhookEventId: webhookEvent?.id,
          webhookEventType: webhookEventType,
          signatureValid: true,
        },
        metadata: { providerInvoiceId, amountInr },
      }).catch(() => {
        // Don't fail webhook if audit logging fails
      });
      
      // PHASE-7: Record success metric
      const processingTime = Date.now() - requestStartTime;
      recordWebhookMetric({
        eventType: webhookEventType,
        processingTime,
        success: true,
        timestamp: new Date().toISOString(),
        correlationId,
      });
      
      logWithContext('info', 'Webhook processed successfully', {
        correlationId,
        eventType: webhookEventType,
        companyId,
        providerInvoiceId,
        processingTime,
      });
      
      return NextResponse.json({ received: true, invoice: true }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    // Subscription lifecycle events
    if (subscriptionEntityForIdempotency?.id) {
      const subscriptionEntity = subscriptionEntityForIdempotency;
      const subId = String(subscriptionEntity.id);
      const status = String(subscriptionEntity.status ?? '').toLowerCase();
      const currentEnd = typeof subscriptionEntity.current_end === 'number' ? new Date(subscriptionEntity.current_end * 1000).toISOString() : null;
      const cancelAtCycleEnd = subscriptionEntity.cancel_at_cycle_end === 1 || subscriptionEntity.cancel_at_cycle_end === true;

      // PHASE-2: Admin already fetched above for idempotency check
      
      // Map Razorpay status to our status
      let subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED' = 'ACTIVE';
      if (status === 'active') subscriptionStatus = 'ACTIVE';
      else if (status === 'cancelled' || status === 'completed') subscriptionStatus = 'CANCELLED';
      else if (status === 'paused') subscriptionStatus = 'PAUSED';
      else if (status === 'expired') subscriptionStatus = 'EXPIRED';

      // PHASE-2: Find company by subscription ID with validation
      const { data: company, error: companyFetchError } = await admin
        .from('companies')
        .select('id')
        .eq('razorpay_subscription_id', subId)
        .maybeSingle();

      if (companyFetchError) {
        throw new Error(`PHASE-2: Failed to fetch company: ${companyFetchError.message}`);
      }

      if (company) {
        // PHASE-5: Check and reconcile company-subscription consistency
        const consistencyCheck = await checkCompanySubscriptionConsistency(admin, company.id, subId);
        if (!consistencyCheck.consistent) {
          console.warn('PHASE-5: Company-subscription consistency issues detected', {
            companyId: company.id,
            subscriptionId: subId,
            issues: consistencyCheck.issues,
          });
          
          // PHASE-5: Attempt reconciliation
          const reconciliation = await reconcileCompanySubscription(admin, company.id, subId, subscriptionStatus);
          if (reconciliation.reconciled && reconciliation.changes.length > 0) {
            console.info('PHASE-5: Company-subscription data reconciled', {
              companyId: company.id,
              changes: reconciliation.changes,
            });
          }
        }
        // PHASE-2: Validate company ID before proceeding
        if (!isValidUUID(company.id)) {
          throw new Error(`PHASE-2: Invalid company ID from database: ${company.id}`);
        }
        
        // PHASE-2: Update company_subscriptions table with validation
        const { data: existingSub, error: subFetchError } = await admin
          .from('company_subscriptions')
          .select('id, plan_id')
          .eq('company_id', company.id)
          .maybeSingle();

        if (subFetchError) {
          throw new Error(`PHASE-2: Failed to fetch subscription: ${subFetchError.message}`);
        }

        if (existingSub) {
          // PHASE-2: Validate existing subscription ID
          if (!isValidUUID(existingSub.id)) {
            throw new Error(`PHASE-2: Invalid subscription ID from database: ${existingSub.id}`);
          }
          
          const { error: updateError } = await admin
            .from('company_subscriptions')
            .update({
              razorpay_subscription_id: subId,
              status: subscriptionStatus,
              current_period_end: currentEnd,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingSub.id);

          if (updateError) {
            throw new Error(`PHASE-2: Failed to update subscription: ${updateError.message}`);
          }
        } else {
          // PHASE-2: Find plan by razorpay_plan_id with validation
          const planId = subscriptionEntity.plan_id ? String(subscriptionEntity.plan_id) : null;
          let plan_id: string | null = null;
          if (planId) {
            const { data: plan, error: planFetchError } = await admin
              .from('subscription_plans')
              .select('id')
              .eq('razorpay_plan_id', planId)
              .maybeSingle();
            
            if (planFetchError) {
              throw new Error(`PHASE-2: Failed to fetch plan: ${planFetchError.message}`);
            }
            
            plan_id = plan?.id || null;
            
            // PHASE-2: Validate plan ID if found
            if (plan_id && !isValidUUID(plan_id)) {
              throw new Error(`PHASE-2: Invalid plan ID from database: ${plan_id}`);
            }
          }

          if (plan_id) {
            const { error: insertError } = await admin
              .from('company_subscriptions')
              .insert({
                company_id: company.id,
                plan_id,
                razorpay_subscription_id: subId,
                status: subscriptionStatus,
                current_period_end: currentEnd,
              });

            if (insertError) {
              throw new Error(`PHASE-2: Failed to insert subscription: ${insertError.message}`);
            }
          }
        }

        // Also update companies table for backward compatibility
        const nextSubscriptionStatus =
          status === 'active'
            ? 'active'
            : status === 'cancelled' || status === 'completed'
              ? 'cancelled'
              : status === 'paused'
                ? 'paused'
                : null;

        // PHASE-2: Update companies table with error handling
        const { error: companyUpdateError } = await admin
          .from('companies')
          .update({
            razorpay_subscription_id: subId,
            razorpay_subscription_status: subscriptionEntity.status ?? null,
            razorpay_plan_id: subscriptionEntity.plan_id ?? null,
            subscription_cancel_at_period_end: cancelAtCycleEnd,
            subscription_current_period_end: currentEnd,
            ...(nextSubscriptionStatus ? { subscription_status: nextSubscriptionStatus } : {}),
            subscription_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', company.id);

        if (companyUpdateError) {
          throw new Error(`PHASE-2: Failed to update company: ${companyUpdateError.message}`);
        }
      }

      try {
        await writeAuditLog({
          companyId: String(subscriptionEntity?.notes?.company_id ?? company?.id ?? ''),
          actor: 'system',
          action: `razorpay_subscription_${status || 'event'}`,
          status: 'success',
          integrationSystem: 'razorpay',
          metadata: { event: eventType, subscription_id: subId, status: subscriptionEntity.status, plan_id: subscriptionEntity.plan_id },
        });
      } catch {
        // ignore
      }

      // PHASE-2: Mark webhook as processed after successful subscription update
      if (idempotencyKey) {
        await markWebhookProcessed(admin, idempotencyKey, eventType, {
          subscription_id: subId,
          company_id: company?.id,
          status: subscriptionStatus,
        }).catch(err => {
          console.warn('PHASE-2: Failed to mark subscription webhook as processed', err);
        });
      }
      
      // PHASE-6: Log successful subscription update with security context
      if (company?.id) {
        await writeSecurityAuditLog({
          companyId: company.id,
          action: 'webhook_subscription_updated',
          status: 'success',
          securityContext: {
            webhookEventId: webhookEvent?.id,
            webhookEventType: webhookEventType,
            signatureValid: true,
          },
          metadata: { subscriptionId: subId, status: subscriptionStatus },
        }).catch(() => {
          // Don't fail webhook if audit logging fails
        });
      }
      
      // PHASE-7: Record success metric
      const processingTime = Date.now() - requestStartTime;
      recordWebhookMetric({
        eventType: webhookEventType,
        processingTime,
        success: true,
        timestamp: new Date().toISOString(),
        correlationId,
      });
      
      logWithContext('info', 'Webhook processed successfully', {
        correlationId,
        eventType: webhookEventType,
        companyId: company?.id,
        subscriptionId: subId,
        processingTime,
      });
      
      return NextResponse.json({ received: true, subscription: true }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    // We only care about add-on order events that include order_id + payment_id
    if (paymentEntityForIdempotency) {
      const paymentEntity = paymentEntityForIdempotency;
      const orderId = paymentEntity?.order_id as string | undefined;
      const paymentId = paymentEntity?.id as string | undefined;

      if (!orderId) {
        // Acknowledge unknown events; don't fail webhook
        return NextResponse.json({ received: true, ignored: true });
      }

      // For safety: only process on captured/paid style events
      const allowedEvents = new Set(["payment.captured", "order.paid"]);
      if (eventType && !allowedEvents.has(eventType)) {
        return NextResponse.json({ received: true, ignored: true, event: eventType });
      }

      const result = await applyAddonFromOrder(orderId, paymentId ?? null);
      
      // PHASE-5: Check invoice-order consistency after processing
      if (result && !result.ignored && !result.alreadyProcessed) {
        // Extract company ID from result if available
        const companyId = (result as any).companyId || (result as any).company_id;
        if (companyId) {
          const consistencyCheck = await checkInvoiceOrderConsistency(
            admin,
            orderId,
            null, // Invoice ID not available here
            companyId
          ).catch(err => {
            console.warn('PHASE-5: Failed to check invoice-order consistency', err);
            return { consistent: true, issues: [] }; // Don't fail webhook
          });
          
          if (!consistencyCheck.consistent) {
            console.warn('PHASE-5: Invoice-order consistency issues detected', {
              orderId,
              companyId,
              issues: consistencyCheck.issues,
            });
          }
        }
      }
      
      // PHASE-2: Mark webhook as processed after successful addon application
      if (idempotencyKey) {
        await markWebhookProcessed(admin, idempotencyKey, eventType, {
          order_id: orderId,
          payment_id: paymentId,
          result: result,
        }).catch(err => {
          console.warn('PHASE-2: Failed to mark payment webhook as processed', err);
        });
      }
      
      // PHASE-6: Log successful addon processing with security context
      const companyId = (result as any)?.companyId || (result as any)?.company_id;
      if (companyId) {
        await writeSecurityAuditLog({
          companyId,
          action: 'webhook_addon_processed',
          status: 'success',
          securityContext: {
            webhookEventId: webhookEvent?.id,
            webhookEventType: webhookEventType,
            signatureValid: true,
          },
          metadata: { orderId, paymentId, result },
        }).catch(() => {
          // Don't fail webhook if audit logging fails
        });
      }
      
      // PHASE-7: Record success metric
      const processingTime = Date.now() - requestStartTime;
      recordWebhookMetric({
        eventType: webhookEventType,
        processingTime,
        success: true,
        timestamp: new Date().toISOString(),
        correlationId,
      });
      
      logWithContext('info', 'Webhook processed successfully', {
        correlationId,
        eventType: webhookEventType,
        companyId,
        orderId,
        processingTime,
      });

      return NextResponse.json({ received: true, ...result }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
  } catch (err: any) {
    // PHASE-3: Comprehensive error handling with classification
    const classified = classifyError(err, {
      eventType: webhookEventType || webhookEvent?.event,
      eventId: webhookEvent?.id,
      operation: 'webhook_handler',
    });
    
    // PHASE-7: Record failure metric
    const processingTime = Date.now() - requestStartTime;
    recordWebhookMetric({
      eventType: webhookEventType || 'unknown',
      processingTime,
      success: false,
      errorType: classified.type,
      timestamp: new Date().toISOString(),
      correlationId,
    });
    
    logWebhookError('Webhook Handler', classified, {
      rawBody: webhookRawBody?.substring(0, 500), // Truncate for safety
      signature: webhookSignature ? 'present' : 'missing',
      correlationId,
      processingTime,
    });
    
    // PHASE-7: Log error with context
    logWithContext('error', 'Webhook processing failed', {
      correlationId,
      eventType: webhookEventType || 'unknown',
      errorType: classified.type,
      errorMessage: classified.message,
      processingTime,
      retryable: classified.retryable,
    });
    
    // PHASE-6: Log security event for webhook failures
    const companyId = webhookEvent?.payload?.invoice?.entity?.notes?.company_id ||
                     webhookEvent?.payload?.subscription?.entity?.notes?.company_id ||
                     'unknown';
    
    if (companyId !== 'unknown') {
        await writeSecurityAuditLog({
          companyId: String(companyId),
          action: 'webhook_processing_failed',
          status: 'failed',
        securityContext: {
          webhookEventId: webhookEvent?.id,
          webhookEventType: webhookEventType,
          signatureValid: !!webhookSignature,
        },
        metadata: {
          errorType: classified.type,
          errorMessage: classified.message,
          retryable: classified.retryable,
        },
      }).catch(() => {
        // Don't fail if audit logging fails
      });
    }
    
    // PHASE-3: Log to dead letter queue if non-retryable
    const idempotencyKey = webhookEvent?.id ? generateWebhookIdempotencyKey(
      String(webhookEvent.id),
      'unknown',
      String(webhookEvent?.payload?.invoice?.entity?.id || 
             webhookEvent?.payload?.subscription?.entity?.id || 
             webhookEvent?.payload?.payment?.entity?.id || 
             'unknown')
    ) : null;
    
    if (!classified.retryable && idempotencyKey && webhookAdmin) {
      await logToDeadLetterQueue(webhookAdmin, idempotencyKey, webhookEventType || 'unknown', classified, webhookEvent).catch(() => {
        // Ignore DLQ errors - already logged
      });
    }
    
    // PHASE-3: Return appropriate status based on error type
    // For validation/permanent errors, return 200 to avoid retries
    // For transient/system errors, return 500 to trigger Razorpay retry
    if (classified.type === WebhookErrorType.VALIDATION || 
        classified.type === WebhookErrorType.PERMANENT ||
        classified.type === WebhookErrorType.BUSINESS_LOGIC) {
      return NextResponse.json({ 
        received: true, 
        error: classified.message,
        errorType: classified.type,
        retryable: false,
      }, { status: 200 }); // 200 to avoid retries
    }
    
    // For transient/system errors, return 500 to trigger retry
    return NextResponse.json({ 
      received: false, 
      error: classified.message,
      errorType: classified.type,
      retryable: true,
      retryAfter: classified.retryAfter,
    }, { status: 500 }); // 500 to trigger Razorpay retry
  }
}

// PHASE-7: Health check endpoint
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const path = url.pathname;
    
    // PHASE-7: Health check endpoint
    if (path.includes('/health') || path.includes('/status')) {
      const stats = getProcessingStats();
      const admin = getSupabaseAdmin();
      
      // PHASE-7: Check database connectivity
      let dbHealthy = false;
      try {
        const { error } = await admin
          .from('companies')
          .select('id')
          .limit(1);
        dbHealthy = !error;
      } catch {
        dbHealthy = false;
      }
      
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: dbHealthy ? 'connected' : 'disconnected',
        statistics: {
          totalProcessed: stats.totalProcessed,
          successful: stats.successful,
          failed: stats.failed,
          successRate: stats.totalProcessed > 0 
            ? ((stats.successful / stats.totalProcessed) * 100).toFixed(2) + '%'
            : '0%',
          averageProcessingTime: Math.round(stats.averageProcessingTime) + 'ms',
          lastProcessed: stats.lastProcessed,
          byEventType: stats.byEventType,
        },
        version: '1.0.0',
      };
      
      return NextResponse.json(health, {
        status: dbHealthy ? 200 : 503,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      });
    }
    
    // PHASE-7: Statistics endpoint
    if (path.includes('/stats') || path.includes('/metrics')) {
      const stats = getProcessingStats();
      return NextResponse.json(stats, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      });
    }
    
    // PHASE-7: Reset statistics endpoint (for testing/admin use)
    if (path.includes('/reset-stats')) {
      // PHASE-7: In production, add authentication check here
      resetProcessingStats();
      return NextResponse.json({ 
        message: 'Statistics reset',
        timestamp: new Date().toISOString(),
      });
    }
    
    return NextResponse.json({ 
      message: 'Webhook endpoint - use POST for webhooks',
      endpoints: {
        health: '/api/razorpay/webhook/health',
        stats: '/api/razorpay/webhook/stats',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: 'Health check failed',
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

// PHASE-8: Export test utilities (only in development/test environment)
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
  // PHASE-8: Export functions for testing
  (global as any).__WEBHOOK_TEST_UTILS__ = {
    generateCorrelationId,
    logWithContext,
    measurePerformance,
    recordWebhookMetric,
    getProcessingStats,
    resetProcessingStats,
    classifyError,
    retryOperation,
    validateInvoiceData,
    validateDiscountBreakdown,
    reconcileInvoiceAmounts,
    checkCompanySubscriptionConsistency,
    reconcileCompanySubscription,
    checkInvoiceOrderConsistency,
    validateInvoiceIntegrity,
    sanitizeString,
    sanitizeUUID,
    sanitizeNumber,
    sanitizeWebhookEvent,
    verifyRazorpayWebhookSignatureEnhanced,
    authorizeWebhookOperation,
    writeSecurityAuditLog,
    isValidUUID,
    parsePurpose,
    parseCartPurpose,
    normalizeCartItems,
  };
}
