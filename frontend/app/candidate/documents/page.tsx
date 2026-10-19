import { MyDocuments } from "@/components/documents/my-documents";

export const metadata = { title: "Documents" };

export default function Page() {
  return <MyDocuments role="candidate" />;
}
