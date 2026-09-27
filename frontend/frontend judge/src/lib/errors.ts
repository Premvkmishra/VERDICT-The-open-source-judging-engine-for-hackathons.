import { toast } from "sonner";

import { ApiError } from "./api";

/** One shared error handler, driven by the contract's {error:{code,message}} shape. */
export function handleApiError(error: unknown, fallback = "Something went wrong."): void {
  const { title, description } = describeApiError(error, fallback);
  toast.error(title, description ? { description } : undefined);
}

export function describeApiError(
  error: unknown,
  fallback = "Something went wrong.",
): { title: string; description?: string } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "unauthenticated":
        return { title: "Please sign in", description: error.message };
      case "forbidden":
        return { title: "Not allowed", description: error.message };
      case "not_found":
        return { title: "Not found", description: error.message };
      case "deadline_passed":
        return { title: "The deadline has passed", description: error.message };
      case "event_not_open":
        return { title: "This isn't open right now", description: error.message };
      case "conflict":
        return { title: "Already recorded", description: error.message };
      case "rate_limited":
        return { title: "Slow down a moment", description: error.message };
      case "validation_error":
        return { title: "Check your answers", description: error.message };
      default:
        return { title: error.message || fallback };
    }
  }
  if (error instanceof Error && error.message) return { title: fallback, description: error.message };
  return { title: fallback };
}

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  const { title, description } = describeApiError(error, fallback);
  return description ? `${title} — ${description}` : title;
}
