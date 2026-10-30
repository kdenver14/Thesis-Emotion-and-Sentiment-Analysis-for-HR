import { redirect } from "next/navigation";

// The dashboard is the landing screen for every role. Uploading lives at
// /upload, reached from the nav.
export default function RootPage() {
  redirect("/dashboard");
}
