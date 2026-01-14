import { vtexFetch } from "./vtex.js";

type MasterdataCustomer = {
  id?: string;
  userId?: string;
  email?: string;
};

const masterdataEmailCache = new Map<string, string | null>();

function cacheKey(label: string, value?: string | null) {
  return value ? `${label}:${value}` : null;
}

async function fetchMasterdataEmailByWhere(where: string): Promise<string | null> {
  const results = await vtexFetch<MasterdataCustomer[]>({
    path: "/api/dataentities/CL/search",
    query: { _fields: "id,userId,email", _where: where }
  });
  return results?.[0]?.email || null;
}

export async function fetchMasterdataEmail(options: {
  userId?: string;
  email?: string;
}): Promise<string | null> {
  const keyByUserId = cacheKey("userId", options.userId);
  if (keyByUserId && masterdataEmailCache.has(keyByUserId)) {
    return masterdataEmailCache.get(keyByUserId) ?? null;
  }

  try {
    if (options.userId) {
      const emailByUserId = await fetchMasterdataEmailByWhere(
        `userId=${options.userId}`
      );
      if (emailByUserId) {
        masterdataEmailCache.set(keyByUserId, emailByUserId);
        return emailByUserId;
      }

      const emailById = await fetchMasterdataEmailByWhere(`id=${options.userId}`);
      if (emailById) {
        masterdataEmailCache.set(keyByUserId, emailById);
        return emailById;
      }
    }

    if (options.email) {
      const keyByEmail = cacheKey("email", options.email);
      if (keyByEmail && masterdataEmailCache.has(keyByEmail)) {
        return masterdataEmailCache.get(keyByEmail) ?? null;
      }

      const emailByEmail = await fetchMasterdataEmailByWhere(
        `email=${options.email}`
      );
      if (keyByEmail) {
        masterdataEmailCache.set(keyByEmail, emailByEmail);
      }
      return emailByEmail;
    }
  } catch (error) {
    if (keyByUserId) {
      masterdataEmailCache.set(keyByUserId, null);
    }
    return null;
  }

  if (keyByUserId) {
    masterdataEmailCache.set(keyByUserId, null);
  }
  return null;
}
