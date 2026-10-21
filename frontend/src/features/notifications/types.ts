export type Notification = {
  id: string;
  created_at: string;
  read: boolean;
  title: string;
  text: string;
  application_id: string | null;
  route: string | null;
};
