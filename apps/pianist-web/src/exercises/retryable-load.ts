/** A queue slot retains its identity on failure, but not its rejected promise. */
export class RetryableLoad<T> {
  private pending?: Promise<T>;
  constructor(private readonly load: () => Promise<T>) {}
  read(): Promise<T> {
    return (this.pending ??= Promise.resolve()
      .then(this.load)
      .catch((error) => {
        this.pending = undefined;
        throw error;
      }));
  }
}
