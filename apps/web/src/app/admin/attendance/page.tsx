import AttendanceView from "@/components/AttendanceView";

export default async function AdminAttendance({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string; date?: string }>;
}) {
  const sp = await searchParams;
  return <AttendanceView batchId={sp.batchId} date={sp.date} />;
}
