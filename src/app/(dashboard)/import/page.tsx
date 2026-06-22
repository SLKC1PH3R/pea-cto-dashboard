import { redirect } from "next/navigation";

export default function ImportPage() {
  redirect("/dashboard?tab=import");
}
