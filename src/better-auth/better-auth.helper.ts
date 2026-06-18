import { createHash } from "@better-auth/utils/hash";
import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "better-auth/api";

export const checkPasswordCompromise = async (
  password: string,
): Promise<void> => {
  const sha1Hash = (
    await createHash("SHA-1", "hex").digest(password)
  ).toUpperCase();
  const prefix = sha1Hash.slice(0, 5);
  const suffix = sha1Hash.slice(5);

  const { data, error } = await betterFetch<string>(
    `https://api.pwnedpasswords.com/range/${prefix}`,
    {
      headers: {
        "Add-Padding": "true",
        "User-Agent": "BetterAuth Password Checker",
      },
    },
  );

  if (error) {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: "Failed to check password security",
    });
  }

  const lines = data.split("\n");
  const found = lines.some(
    (line) => line.split(":")[0]?.toUpperCase() === suffix,
  );

  if (found) {
    throw new APIError("BAD_REQUEST", {
      code: "PASSWORD_COMPROMISED",
      message:
        "This password has been compromised in a data breach. Please choose a different password.",
    });
  }
};
