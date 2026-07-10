# @workspace-starter/storage

Browser storage helpers for frontend code.

## localStorage

```ts
import {
  readLocalStorage,
  writeLocalStorage,
} from '@workspace-starter/storage';

writeLocalStorage('theme', 'dark');
const theme = readLocalStorage('theme', 'light');
```

## IndexedDB

```ts
import { createIndexedDbStore } from '@workspace-starter/storage';

const preferences = createIndexedDbStore({
  databaseName: 'workspace-starter',
  storeName: 'preferences',
});

await preferences.set('sidebar-open', true);
const sidebarOpen = await preferences.get<boolean>('sidebar-open');
```
