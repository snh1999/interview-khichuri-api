import { isIP } from "node:net";

import type { Request } from "express";

export const resolveClientIp = (req: Request): string => {
  if (process.env.RENDER === "true") {
    const header = req.headers["cf-connecting-ip"];
    if (typeof header === "string" && isIP(header.trim())) {
      return header.trim();
    }
  }
  return req.ip ?? "unknown";
};
