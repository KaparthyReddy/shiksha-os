import LiveRoom from "@/components/LiveRoom";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";

export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await api<Me>("/auth/me");
  const staff = me.role !== "student";
  return <LiveRoom classId={id} isStaff={staff} backHref={staff ? `/staff/live/${id}` : "/student/live"} />;
}
