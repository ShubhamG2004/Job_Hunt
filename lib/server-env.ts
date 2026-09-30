export function getServerEnv(name: string): string | undefined {
  return process.env[name];
}