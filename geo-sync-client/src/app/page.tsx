import dynamic from "next/dynamic";

const MapSync = dynamic(
  () => import("@/components/MapSync").then(mod => mod.MapSync),
  { ssr: false }
);

export default function Home() {
  return <MapSync />;
}