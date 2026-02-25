import { type QueryFunction, useQuery } from "@tanstack/react-query";
import { service } from "@/utils/request";

// IResponse type should declared in src/js/modules/{module_name}/types/index.ts
interface IResponse {
  id: string;
}

interface IRequest {
  param1?: string;
}

// src/js/modules/{module_name}/queries/useGetQueryTemplate.ts
export const GET_QUERY_KEY = "hooks/useGetQueryTemplate";

export const useGetQueryTemplate = ({ param1 }: IRequest) => {
  return useQuery({
    queryKey: [GET_QUERY_KEY, param1],
    queryFn: getQueryFunction,
    enabled: !!param1,
  });
};

export const getQueryFunction: QueryFunction<
  IResponse,
  [string, string?]
> = async ({ queryKey }) => {
  const [_key, param1] = queryKey;
  const response = await service.get<IResponse>("/query/template", {
    params: { param1 },
  });
  return response.data;
};
