import { trpc } from '../lib/trpc';

// Example React island — shows how to call the tRPC API from the frontend.
// Use with <UserList client:load /> in an .astro file.
export function UserList() {
  const { data: users, isLoading, error } = trpc.users.list.useQuery();

  if (isLoading) {
    return (
      <div className="grid gap-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-20 animate-pulse rounded-3xl border border-slate-200/80 bg-white/70"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
        The client example could not reach the API. Start `pnpm dev` to see the
        hydrated tRPC query in action.
      </p>
    );
  }

  if (!users?.length) {
    return (
      <p className="rounded-3xl border border-dashed border-slate-300 bg-white/70 px-4 py-4 text-sm text-slate-600">
        No sample users were returned.
      </p>
    );
  }

  return (
    <ul className="grid gap-3">
      {users?.map((user) => (
        <li
          key={user.id}
          className="flex items-center justify-between rounded-3xl border border-slate-200/80 bg-white/80 px-4 py-4 shadow-[0_20px_50px_rgba(15,23,42,0.06)]"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
          <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-900">
            client
          </span>
        </li>
      ))}
    </ul>
  );
}
