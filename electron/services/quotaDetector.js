'use strict';

/**
 * Detect whether an error is a quota/rate-limit error from an LLM provider.
 * Works with Error objects, strings, or objects with a `.message` property.
 *
 * @param {unknown} error
 * @returns {{ isQuotaError: boolean, provider: string|null, errorType: 'rate_limit'|'quota_exceeded'|'billing'|null }}
 */
function detectQuotaError(error) {
  const msg = _extractMessage(error).toLowerCase();

  if (!msg) return { isQuotaError: false, provider: null, errorType: null };

  const QUOTA_PATTERNS = [
    'quota exceeded',
    'resource_exhausted',
    'resource exhausted',
    'insufficient_quota',
    'insufficient quota',
    'quota_exceeded',
    'rate limit exceeded',
    'rate_limit_exceeded',
    'too many requests',
    'billing',
    'credits',
    'payment required',
    'out of credits',
    'usage limit',
    'context_length_exceeded',
  ];

  const RATE_LIMIT_PATTERNS = [
    'too many requests',
    'rate limit',
    'rate_limit',
    'throttl',
    '429',
  ];

  const BILLING_PATTERNS = [
    'billing',
    'credits',
    'payment required',
    '402',
    'out of credits',
    'insufficient_quota',
    'insufficient quota',
  ];

  const isQuotaError = QUOTA_PATTERNS.some((p) => msg.includes(p));
  if (!isQuotaError) return { isQuotaError: false, provider: null, errorType: null };

  let errorType = 'quota_exceeded';
  if (RATE_LIMIT_PATTERNS.some((p) => msg.includes(p))) errorType = 'rate_limit';
  if (BILLING_PATTERNS.some((p) => msg.includes(p))) errorType = 'billing';

  const provider = _extractProvider(_extractMessage(error));

  return { isQuotaError: true, provider, errorType };
}

/**
 * Extract a provider name from an error message.
 * @param {string} msg
 * @returns {string|null}
 */
function _extractProvider(msg) {
  const lower = msg.toLowerCase();
  if (lower.includes('gemini') || lower.includes('google')) return 'Gemini';
  if (lower.includes('openai') || lower.includes('gpt')) return 'OpenAI';
  if (lower.includes('anthropic') || lower.includes('claude')) return 'Anthropic';
  if (lower.includes('mistral')) return 'Mistral';
  if (lower.includes('groq')) return 'Groq';
  return null;
}

/**
 * Safely extract a string message from any error-like value.
 * @param {unknown} error
 * @returns {string}
 */
function _extractMessage(error) {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    if (typeof error.message === 'string') return error.message;
    if (typeof error.toString === 'function') return error.toString();
  }
  return '';
}

module.exports = { detectQuotaError };
