import { Auth } from "@/components/auth";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  if (role !== "student" && role !== "teacher") notFound();
  return <Auth role={role} />;
}
