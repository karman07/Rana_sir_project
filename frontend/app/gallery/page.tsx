import { Suspense } from "react";
import { GalleryContent } from "./gallery-content";

export const metadata = { title: "Component gallery" };

export default function Gallery() {
  return <Suspense><GalleryContent /></Suspense>;
}
