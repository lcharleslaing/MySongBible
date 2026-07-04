import { placeholderRequest } from "./client";

export async function getSystemHealthPlaceholder() {
  return placeholderRequest({
    backend: "pending",
    voice: "pending",
    desktop: "pending",
  });
}
