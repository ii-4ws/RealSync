import { describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

// Mock the notifyOwner function
vi.mock('./_core/notification', () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: 'https',
      headers: {},
    } as TrpcContext['req'],
    res: {
      clearCookie: vi.fn(),
    } as any,
  };
}

describe('contact.submit', () => {
  it('should successfully submit a valid contact form', async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.contact.submit({
      name: 'John Doe',
      email: 'john@example.com',
      message: 'This is a test message for the contact form.',
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Thank you');
  });

  it('should reject invalid email addresses', async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.contact.submit({
        name: 'John Doe',
        email: 'invalid-email',
        message: 'This is a test message.',
      })
    ).rejects.toThrow();
  });

  it('should reject messages shorter than 10 characters', async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.contact.submit({
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Short',
      })
    ).rejects.toThrow();
  });

  it('should reject names shorter than 2 characters', async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.contact.submit({
        name: 'J',
        email: 'john@example.com',
        message: 'This is a test message.',
      })
    ).rejects.toThrow();
  });

  it('should silently fail honeypot attempts', async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.contact.submit({
      name: 'John Doe',
      email: 'john@example.com',
      message: 'This is a test message.',
      website: 'https://spam-site.com', // Honeypot field filled
    });

    // Should return success but not actually process
    expect(result.success).toBe(true);
  });

  it('should handle maximum length constraints', async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const longName = 'a'.repeat(101); // Exceeds max of 100
    const longMessage = 'a'.repeat(1001); // Exceeds max of 1000

    await expect(
      caller.contact.submit({
        name: longName,
        email: 'john@example.com',
        message: 'This is a test message.',
      })
    ).rejects.toThrow();

    await expect(
      caller.contact.submit({
        name: 'John Doe',
        email: 'john@example.com',
        message: longMessage,
      })
    ).rejects.toThrow();
  });
});
