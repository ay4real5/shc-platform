/** An in-app notification as the API returns it. Titles and bodies never contain personal details. */
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}
