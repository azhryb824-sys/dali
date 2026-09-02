import { PwaSetupClient } from "@/app/components/PwaSetupClient";

export default async function PwaSetupPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const query = await searchParams;
  return <PwaSetupClient code={query.code || ""} />;
}
