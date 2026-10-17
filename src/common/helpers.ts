export const omitKeys = <T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Omit<T, K> =>
  Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keys.includes(key as K)),
  ) as Omit<T, K>;

export const omitArrayKeys = <T extends object, K extends keyof T>(
  obj: T[],
  keys: readonly K[],
): Omit<T, K>[] => obj.map((val) => omitKeys(val, keys));

export const stripId = <T extends { id?: string | number }>(
  data: T[] | T,
): Omit<T, "id">[] | Omit<T, "id"> =>
  Array.isArray(data) ? omitArrayKeys(data, ["id"]) : omitKeys(data, ["id"]);
