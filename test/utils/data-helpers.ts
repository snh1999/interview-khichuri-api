/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
export const expectEnum = (allowed: string[]) => ({
  asymmetricMatch(received: unknown): boolean {
    return allowed.includes(received as string);
  },
  toString(): string {
    return `Enum(${allowed.join(" | ")})`;
  },
});

export const expectNullableString = {
  asymmetricMatch(received: unknown): boolean {
    return received === null || typeof received === "string";
  },
  toString(): string {
    return "string | null";
  },
};

export const expectNullableNumber = {
  asymmetricMatch(received: unknown): boolean {
    return received === null || typeof received === "number";
  },
  toString(): string {
    return "number | null";
  },
};

export const expectNullableBoolean = {
  asymmetricMatch(received: unknown): boolean {
    return received === null || typeof received === "boolean";
  },
  toString(): string {
    return "boolean | null";
  },
};
