let oktModulePromise: Promise<typeof import('oktjs')> | null = null;

export function loadOktTokenizer() {
  if (!oktModulePromise) {
    oktModulePromise = import('oktjs');
  }

  return oktModulePromise;
}
