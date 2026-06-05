export const expectEnum = (allowed: string[]) => ({
  asymmetricMatch(received: unknown): boolean {
    return allowed.includes(received as string);
  },
  toString(): string {
    return `Enum(${allowed.join(" | ")})`;
  },
});
