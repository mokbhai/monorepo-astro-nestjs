import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from './trpc';

const userSelect = {
  id: true,
  name: true,
  email: true,
} as const;

const usersRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.user.findMany({
      select: userSelect,
      orderBy: { createdAt: 'asc' },
    });
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.id },
        select: userSelect,
      });

      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      return user;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.create({
        data: input,
        select: userSelect,
      });
    }),
});

export const appRouter = router({
  users: usersRouter,
});

// This type is imported by apps/web for end-to-end type safety
export type AppRouter = typeof appRouter;
