export const dynamic = "force-dynamic";

import dynamicImport from "next/dynamic";

const MapSync = dynamicImport(
  () => import("@/components/MapSync").then(mod => mod.MapSync),
  { ssr: false }
);

export default function Home() {
  return <MapSync />;
}