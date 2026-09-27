import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

import { ApiError, apiPost, request } from "./api";
import type { Me, Membership, User } from "./types";
import type { MembershipRole } from "./enums";

/**
 * GET /auth/me returns the current user plus their event memberships. The
 * contract does not pin the exact envelope shape, so normalise the two
 * reasonable readings into one Me object.
 */
function normalizeMe(data: unknown): Me | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Record<string, unknown>;

  const nestedUser = raw['user'] as User | undefined;
  const user = nestedUser ?? (raw['id'] ? (raw as unknown as User) : undefined);
  if (!user?.id) return null;

  const membershipsRaw =
    (raw['memberships'] as Membership[] | undefined) ??
    ((nestedUser ? (raw['event_memberships'] as Membership[] | undefined) : undefined) ??
      ((raw['event_memberships'] as Membership[] | undefined) ?? []));

  return { user, memberships: Array.isArray(membershipsRaw) ? membershipsRaw : [] };
}

export const meQueryKey = ["auth", "me"] as const;

export async function fetchMe(): Promise<Me | null> {
  try {
    const res = await request<unknown>("/auth/me");
    return normalizeMe(res.data);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}

export function useMe(): UseQueryResult<Me | null> {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    staleTime: 30_000,
    retry: false,
  });
}

export function rolesForEvent(me: Me | null | undefined, slug: string): MembershipRole[] {
  if (!me) return [];
  return me.memberships
    .filter((m) => m.event_slug === slug || (m['event'] as { slug?: string } | undefined)?.slug === slug)
    .map((m) => m.role);
}

export function hasRole(me: Me | null | undefined, slug: string, role: MembershipRole): boolean {
  if (!me) return false;
  if (me.user.is_platform_admin) return true;
  return rolesForEvent(me, slug).includes(role);
}

export function isAdmin(me: Me | null | undefined): boolean {
  return Boolean(me?.user.is_platform_admin);
}

export function useAuthActions() {
  const queryClient = useQueryClient();

  return {
    async login(email: string, password: string) {
      await apiPost("/auth/login", { email, password });
      await queryClient.invalidateQueries();
    },
    async signup(email: string, password: string, display_name: string) {
      await apiPost("/auth/signup", { email, password, display_name });
    },
    async logout() {
      try {
        await apiPost("/auth/logout");
      } finally {
        queryClient.setQueryData(meQueryKey, null);
        await queryClient.invalidateQueries();
      }
    },
  };
}
