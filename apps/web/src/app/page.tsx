import { redirect } from "next/navigation";

// Middleware sends logged-in users to their home; this only runs as a fallback.
export default function Index() {
  redirect("/login");
}
