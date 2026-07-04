export type ApiResult<T> = {
  data: T | null;
  error: string | null;
};

export async function placeholderRequest<T>(data: T): Promise<ApiResult<T>> {
  return Promise.resolve({
    data,
    error: null,
  });
}
