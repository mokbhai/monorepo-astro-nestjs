import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindMany, mockFindUnique, mockCreate, mockPrisma } = vi.hoisted(
  () => {
    const mockFindMany = vi.fn();
    const mockFindUnique = vi.fn();
    const mockCreate = vi.fn();

    return {
      mockFindMany,
      mockFindUnique,
      mockCreate,
      mockPrisma: {
        user: {
          findMany: mockFindMany,
          findUnique: mockFindUnique,
          create: mockCreate,
        },
        $connect: vi.fn(),
        $disconnect: vi.fn(),
      },
    };
  },
);

vi.mock('../src/prisma/client', () => ({
  prisma: mockPrisma,
}));

import { appRouter } from '../src/trpc/router';
import { createContext } from '../src/trpc/context';
import type { Context } from '../src/trpc/context';

const sampleUser = {
  id: '1',
  name: 'Mokshit Jain',
  email: 'm@example.com',
};

function createTestContext(overrides: Partial<Context> = {}): Context {
  return {
    req: {} as Context['req'],
    res: {} as Context['res'],
    user: null,
    db: {
      user: {
        findMany: mockFindMany,
        findUnique: mockFindUnique,
        create: mockCreate,
      },
    } as unknown as Context['db'],
    ...overrides,
  };
}

describe('appRouter users procedures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists users from the database', async () => {
    mockFindMany.mockResolvedValue([sampleUser]);
    const caller = appRouter.createCaller(createTestContext());

    await expect(caller.users.list()).resolves.toEqual([sampleUser]);
    expect(mockFindMany).toHaveBeenCalledWith({
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('returns a user by id', async () => {
    mockFindUnique.mockResolvedValue({ ...sampleUser, id: '42' });
    const caller = appRouter.createCaller(createTestContext());

    await expect(caller.users.getById({ id: '42' })).resolves.toEqual({
      id: '42',
      name: 'Mokshit Jain',
      email: 'm@example.com',
    });
  });

  it('returns NOT_FOUND when a user does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);
    const caller = appRouter.createCaller(createTestContext());

    await expect(caller.users.getById({ id: 'missing' })).rejects.toMatchObject(
      {
        code: 'NOT_FOUND',
      },
    );
  });

  it('rejects unauthenticated user creation', async () => {
    const caller = appRouter.createCaller(createTestContext());

    await expect(
      caller.users.create({ name: 'Ada Lovelace', email: 'ada@example.com' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('creates a user when authenticated', async () => {
    mockCreate.mockResolvedValue({
      id: 'new-user',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    const caller = appRouter.createCaller(
      createTestContext({
        user: { id: 'admin', email: 'admin@example.com' },
      }),
    );

    await expect(
      caller.users.create({ name: 'Ada Lovelace', email: 'ada@example.com' }),
    ).resolves.toEqual({
      id: 'new-user',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
  });
});

describe('createContext', () => {
  function fakeRequest(headers: Record<string, string> = {}) {
    return { headers } as unknown as Context['req'];
  }

  it('wires the shared prisma client onto ctx.db', () => {
    const ctx = createContext({
      req: fakeRequest(),
      res: {} as Context['res'],
    });

    // This is the assertion that would catch drift in client.ts's export
    // shape: if `prisma` stopped being a plain object (e.g. reverted to a
    // promise-returning `getPrisma()`), this identity check would fail.
    expect(ctx.db).toBe(mockPrisma);
  });

  it('resolves no user when the request has no bearer token', () => {
    const ctx = createContext({
      req: fakeRequest(),
      res: {} as Context['res'],
    });

    expect(ctx.user).toBeNull();
  });
});
