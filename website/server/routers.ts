import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { notifyOwner } from "./_core/notification";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  contact: router({
    submit: publicProcedure
      .input(
        z.object({
          name: z.string().min(2).max(100),
          email: z.string().email(),
          message: z.string().min(10).max(1000),
          website: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        // Honeypot validation
        if (input.website) {
          // Silently fail honeypot attempts
          return { success: true, message: 'Thank you for your submission.' };
        }

        try {
          // Send notification to owner
          const notificationSent = await notifyOwner({
            title: `New Contact Form Submission from ${input.name}`,
            content: `Email: ${input.email}\n\nMessage:\n${input.message}`,
          });

          if (!notificationSent) {
            console.warn('[Contact Form] Owner notification failed');
          }

          // TODO: Implement actual email sending to info@real-sync.app
          // For now, we're using the owner notification system
          console.log('[Contact Form] Submission received:', {
            name: input.name,
            email: input.email,
            timestamp: new Date().toISOString(),
          });

          return {
            success: true,
            message: 'Thank you for your message. We will get back to you soon!',
          };
        } catch (error) {
          console.error('[Contact Form] Error processing submission:', error);
          throw new Error('Failed to process your submission. Please try again later.');
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
