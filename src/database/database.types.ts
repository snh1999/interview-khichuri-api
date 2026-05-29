export type TReturn<T> = Promise<T> | T;

export abstract class IDatabaseService {
  public abstract dbPing(): TReturn<void>;
}
