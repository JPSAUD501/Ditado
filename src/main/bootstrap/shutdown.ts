const DEFAULT_SHUTDOWN_TIMEOUT_MS = 3_000

const withTimeout = async (task: Promise<unknown>, timeoutMs: number): Promise<void> => {
  await Promise.race([
    task.then(() => undefined).catch(() => undefined),
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs)
    }),
  ])
}

export const shutdownServices = async (
  services: {
    insertion: { dispose: () => void | Promise<void> }
  },
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
): Promise<void> => {
  await withTimeout(Promise.resolve(services.insertion.dispose()), timeoutMs)
}
