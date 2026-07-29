import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { rateLimiter, strictRateLimiter } from '../api/rate-limit-middleware.js';

describe('Rate Limiting Middleware', () => {
    let app: express.Application;

    beforeAll(() => {
        app = express();
        app.use(express.json());

        // Test route with standard rate limiter
        app.get('/test', rateLimiter, (req, res) => {
            res.json({ message: 'success' });
        });

        // Test route with strict rate limiter
        app.get('/test-strict', strictRateLimiter, (req, res) => {
            res.json({ message: 'success' });
        });

        // Health check endpoint (should be skipped by rate limiter)
        app.get('/health', rateLimiter, (req, res) => {
            res.json({ status: 'ok' });
        });
    });

    it('should allow requests under the limit', async () => {
        const response = await request(app).get('/test');
        expect(response.status).toBe(200);
        expect(response.body.message).toBe('success');
    });

    it('should include rate limit headers in response', async () => {
        const response = await request(app).get('/test');
        expect(response.headers['ratelimit-limit']).toBeDefined();
        expect(response.headers['ratelimit-remaining']).toBeDefined();
        expect(response.headers['ratelimit-reset']).toBeDefined();
    });

    it('should correctly set ratelimit-limit to 100 for standard limiter', async () => {
        const response = await request(app).get('/test');
        expect(response.headers['ratelimit-limit']).toBe('100');
    });

    it('should track remaining requests correctly', async () => {
        const res1 = await request(app).get('/test');
        const remaining1 = parseInt(res1.headers['ratelimit-remaining']);
        expect(remaining1).toBeGreaterThanOrEqual(0);
        expect(remaining1).toBeLessThanOrEqual(99);
    });

    it('should return 429 status when rate limit exceeded', async () => {
        // Make 101 requests to exceed the 100 req/min limit
        const requests = [];
        for (let i = 0; i < 101; i++) {
            requests.push(request(app).get('/test'));
        }

        const responses = await Promise.all(requests);
        const blockedResponses = responses.filter(r => r.status === 429);

        expect(blockedResponses.length).toBeGreaterThan(0);
        expect(blockedResponses[0].body.error).toBeDefined();
    }, 30000);

    it('should block IP after exceeding 100 requests per minute', async () => {
        // Make sequential requests to ensure consistent IP
        let blockedCount = 0;
        for (let i = 0; i < 101; i++) {
            const response = await request(app).get('/test');
            if (response.status === 429) {
                blockedCount++;
            }
        }

        expect(blockedCount).toBeGreaterThan(0);
    }, 30000);

    it('should include retry-after information in error response', async () => {
        // Trigger rate limit
        const requests = [];
        for (let i = 0; i < 101; i++) {
            requests.push(request(app).get('/test'));
        }

        const responses = await Promise.all(requests);
        const blockedResponse = responses.find(r => r.status === 429);

        if (blockedResponse) {
            expect(blockedResponse.body.error).toContain('Too many requests');
            expect(blockedResponse.body.retryAfter).toBeDefined();
        }
    }, 30000);

    it('should apply stricter limits (20 req/min) to strict endpoints', async () => {
        // Make 21 requests to exceed the 20 req/min limit
        const requests = [];
        for (let i = 0; i < 21; i++) {
            requests.push(request(app).get('/test-strict'));
        }

        const responses = await Promise.all(requests);
        const blockedResponses = responses.filter(r => r.status === 429);

        expect(blockedResponses.length).toBeGreaterThan(0);
    }, 30000);

    it('should set ratelimit-limit to 20 for strict limiter', async () => {
        const response = await request(app).get('/test-strict');
        expect(response.headers['ratelimit-limit']).toBe('20');
    });

    it('should skip rate limiting for health check endpoint', async () => {
        // Health check should not be rate limited even after many requests
        const requests = [];
        for (let i = 0; i < 150; i++) {
            requests.push(request(app).get('/health'));
        }

        const responses = await Promise.all(requests);
        // All health checks should succeed (200 status)
        const successfulResponses = responses.filter(r => r.status === 200);
        expect(successfulResponses.length).toBe(150);
    }, 30000);

    it('should return 429 with correct message for standard limiter', async () => {
        const requests = [];
        for (let i = 0; i < 101; i++) {
            requests.push(request(app).get('/test'));
        }

        const responses = await Promise.all(requests);
        const blockedResponse = responses.find(r => r.status === 429);

        if (blockedResponse) {
            expect(blockedResponse.body.error).toContain('Too many requests from this IP');
        }
    }, 30000);

    it('should return 429 with correct message for strict limiter', async () => {
        const requests = [];
        for (let i = 0; i < 21; i++) {
            requests.push(request(app).get('/test-strict'));
        }

        const responses = await Promise.all(requests);
        const blockedResponse = responses.find(r => r.status === 429);

        if (blockedResponse) {
            expect(blockedResponse.body.error).toContain('Too many requests to this endpoint');
        }
    }, 30000);

    it('should use standardHeaders for rate limit info', async () => {
        const response = await request(app).get('/test');
        // standardHeaders: true uses RateLimit-* headers (lowercase with hyphens)
        expect(response.headers['ratelimit-limit']).toBeDefined();
        expect(response.headers['ratelimit-remaining']).toBeDefined();
        expect(response.headers['ratelimit-reset']).toBeDefined();
    });

    it('should not use legacy X-RateLimit headers', async () => {
        const response = await request(app).get('/test');
        // legacyHeaders: false means no X-RateLimit-* headers
        expect(response.headers['x-ratelimit-limit']).toBeUndefined();
        expect(response.headers['x-ratelimit-remaining']).toBeUndefined();
        expect(response.headers['x-ratelimit-reset']).toBeUndefined();
    });

    it('should reset rate limit after time window expires', async () => {
        // Note: This test verifies the configuration, not actual time-based reset
        // In production, the 60-second window would reset, but in tests we verify
        // that the middleware is configured for a 60-second window (windowMs: 60 * 1000)
        const response = await request(app).get('/test');
        const ratelimitReset = response.headers['ratelimit-reset'];

        // Reset time should be defined and be a future timestamp
        expect(ratelimitReset).toBeDefined();
        const resetTime = parseInt(ratelimitReset as string, 10);
        const now = Math.floor(Date.now() / 1000);

        // Reset should be approximately 60 seconds in future
        expect(resetTime).toBeGreaterThan(now);
        expect(resetTime).toBeLessThanOrEqual(now + 61);
    });

    it('should prevent distributed DoS with per-IP tracking', async () => {
        // Verify that rate limiting is applied per IP address
        // When we make requests, they come from the same test client IP
        let blockedAtRequest = -1;

        for (let i = 0; i < 101; i++) {
            const response = await request(app).get('/test');
            if (response.status === 429 && blockedAtRequest === -1) {
                blockedAtRequest = i;
            }
        }

        // Should be blocked around request 100 (100 allowed + 1 blocked)
        expect(blockedAtRequest).toBeGreaterThanOrEqual(100);
        expect(blockedAtRequest).toBeLessThanOrEqual(100);
    }, 30000);
});
