---
description: "Frontend developer for the Next.js application in the frontend folder"
tools: ["vscode", "execute", "read", "edit", "search", "web", "agent", "todo"]
---

## Required Reading

Before starting any task, review these resources:

- **API Documentation:** `docs/api/api.yaml`
- **Domain Knowledge:** `docs/domain-knowledge/**`

## Workflow Checklist

After implementing actions You must to do these steps:

1. Run `npm run lint:fix` in root (biome). If found issues, fix them and re-run.

---

## Project Structure

```
frontend/src/
├── components/     # Reusable UI components
├── hooks/          # React Query hooks for data fetching/mutations
├── pages/          # Next.js pages
├── styles/         # Global styles
└── utils/          # Utility functions (auth, query, request)
```

---

## Data Fetching with React Query

### Query Hooks (GET requests)

Location: `frontend/src/hooks/use{Resource}.ts`

Template: `frontend/src/hooks/useQueryTemplate.ts`

```typescript
import { service } from "@/utils/request";
import { type QueryFunction, useQuery } from "@tanstack/react-query";

interface IResponse {
  id: string;
}

interface IRequest {
  param1?: string;
}

export const QUERY_KEY = "resourceName";

export const useGetResource = ({ param1 }: IRequest) => {
  return useQuery({
    queryKey: [QUERY_KEY, param1],
    queryFn: queryFunction,
    enabled: !!param1,
  });
};

const queryFunction: QueryFunction<IResponse, [string, string?]> = async ({
  queryKey,
}) => {
  const [_key, param1] = queryKey;
  const response = await service.get<IResponse>("/endpoint", {
    params: { param1 },
  });
  return response.data;
};
```

### Mutation Hooks (POST/PUT/DELETE requests)

Location: `frontend/src/hooks/use{Action}{Resource}.ts`

Template: `frontend/src/hooks/useMutationTemplate.ts`

```typescript
import { QUERY_KEY } from "./useGetResource";
import { queryClient } from "@/utils/query";
import { service } from "@/utils/request";
import { useMutation } from "@tanstack/react-query";

interface IResponse {
  id: string;
}

interface IRequest {
  bodyData: object;
  param1?: string;
}

export const useCreateResource = () => {
  return useMutation({
    mutationFn: async ({ param1, bodyData }: IRequest): Promise<IResponse> => {
      const response = await service.post<IResponse>("/endpoint", bodyData, {
        params: { param1 },
      });
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEY, variables.param1],
      });
    },
  });
};
```

> **Important:** Always invalidate relevant query caches after mutations.

### Mutation Hook Usage Rules

1. **Always destructure mutation hooks** - Never use directly:
   ```typescript
   // ❌ Wrong
   const bookmarkMutation = useBookmarkBook();
   bookmarkMutation.mutate(data);

   // ✅ Correct
   const { mutate: bookmarkBook, isPending: isBookmarking } = useBookmarkBook();
   bookmarkBook(data);
   ```

2. **Never use async/await with mutations** - Use callbacks instead:
   ```typescript
   // ❌ Wrong
   onSuccess: async (_data, variables) => {
     await queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
   }

   // ✅ Correct
   onSuccess: (_data, variables) => {
     queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
   }
   ```

---

## Component Guidelines

### File Organization

| Type       | Location                   | Naming                           |
| ---------- | -------------------------- | -------------------------------- |
| Components | `frontend/src/components/` | `ComponentName.tsx` (PascalCase) |
| Hooks      | `frontend/src/hooks/`      | `useHookName.ts` (camelCase)     |
| Pages      | `frontend/src/pages/`      | `page-name.tsx` (kebab-case)     |

### Component Structure

```typescript
interface ComponentNameProps {
  id: string;
  // other props
}

const ComponentName: React.FC<ComponentNameProps> = ({ id }) => {
  // Use hooks for data fetching
  const { data, isLoading, error } = useGetResource({ id });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading data</div>;

  return (
    <div>
      {/* Component content */}
    </div>
  );
};

export default ComponentName;
```

- All components to render any data from API. Just need pass only IDs as props. Then fetch data inside component using React Query hooks. No worry about duplicate data fetching, React Query will handle caching.

### Best Practices

1. **Functional components only** - No class components
2. **TypeScript required** - Define interfaces for all props
3. **Data fetching in components** - Pass IDs as props, fetch data inside using React Query hooks
4. **Scoped styling** - Use CSS modules or styled-components
5. **Composition** - Break large components into smaller, reusable sub-components
6. **Consistent naming** - PascalCase for components, camelCase for files and hooks
