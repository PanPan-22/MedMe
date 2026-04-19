export interface Schedule {
  id: number;
  medicine_name: string;
  count: number;
  type: string;
  whenToTake: string;
  additional: string;
  stock: number;
  expiration_date: string;
  image_uri: string;
  repeat_days: string;
  start_date: string;
  end_date: string;
  patient_id?: number | null;
  notification_id?: string;
  kind?: string;
}
