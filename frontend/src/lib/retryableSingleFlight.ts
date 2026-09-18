export function createRetryableSingleFlight<T>(
  operation: () => Promise<T>,
  shouldCache: (value: T) => boolean = () => true,
) {
  let inFlight: Promise<T> | null = null;

  return () => {
    if (inFlight) return inFlight;

    let operationResult: Promise<T>;
    try {
      operationResult = Promise.resolve(operation());
    } catch (error) {
      operationResult = Promise.reject(error);
    }
    const current = operationResult.then((value) => {
      if (!shouldCache(value) && inFlight === current) inFlight = null;
      return value;
    }, (error) => {
      if (inFlight === current) inFlight = null;
      throw error;
    });
    inFlight = current;
    return current;
  };
}
