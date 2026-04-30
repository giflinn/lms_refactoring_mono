const API_URL = import.meta.env.VITE_API_URL;

export type Role = "client" | "manager" | "senior_manager" | "admin";

export type User = {
  id: string;
  firebaseUid: string;
  email: string;
  role: Role;
  createdAt: string;
};

export async function fetchMe(idToken: string): Promise<User | null> {
  const res = await fetch(`${API_URL}/me`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GET /me failed: ${res.status}`);
  }
  const data = await res.json();
  return data.user as User;
}
