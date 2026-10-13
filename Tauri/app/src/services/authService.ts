import { apiRequest } from "./api";
import type { ApiUser } from "../types/api";

type UserResponse = { user: ApiUser };

export async function login(email: string, password: string): Promise<ApiUser> {
  const response = await apiRequest<UserResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return response.user;
}

export async function register(
  name: string,
  email: string,
  password: string
): Promise<ApiUser> {
  await apiRequest<UserResponse>("/auth/register", {
    method: "POST",
    body: { name, email, password },
  });

  return login(email, password);
}

export async function getCurrentUser(): Promise<ApiUser> {
  const response = await apiRequest<UserResponse>("/auth/me");
  return response.user;
}

export async function logout(): Promise<void> {
  await apiRequest<{ message: string }>("/auth/logout", {
    method: "POST",
    body: {},
  });
}
