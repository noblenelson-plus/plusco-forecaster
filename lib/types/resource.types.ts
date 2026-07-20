// lib/types/resource.types.ts

/**
 * A shared resource — a named, described external link. Created by admins,
 * readable by everyone. Business Leads just click through to the URL.
 */
export interface Resource {
  id: string;
  name: string;
  description?: string;
  url: string;
  /** Epoch ms of creation — used to order the list (oldest first). */
  createdAt?: number;
}

export interface ResourceFormData {
  name: string;
  description: string;
  url: string;
}
