import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/utils/query";
import { service } from "@/utils/request";
import { GET_QUERY_KEY } from "./useQueryTemplate";

interface IResponse {
  id: string;
}

interface IRequest {
  bodyData: object;
  param1?: string;
}

// src/js/modules/{module_name}/queries/useMutationTemplate.ts
export const useModuleMutation = () => {
  return useMutation({
    mutationFn: mutationFunction,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [GET_QUERY_KEY, variables.param1],
      });
    },
  });
};

const mutationFunction = async ({
  param1,
  bodyData,
}: IRequest): Promise<IResponse> => {
  const response = await service.post<IResponse>(
    "/mutation/template",
    bodyData,
    { params: { param1 } },
  );
  return response.data;
};
