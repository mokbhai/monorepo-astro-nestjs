import { TrpcProvider } from './TrpcProvider';
import { UserList } from './UserList';

export function UsersIsland() {
  return (
    <TrpcProvider>
      <UserList />
    </TrpcProvider>
  );
}
